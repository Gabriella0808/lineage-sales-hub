-- Team Updates: an internal blog/announcements feed. Admins and managers
-- post news/events (with attachments); internal staff (admin, manager, rep -
-- NOT dealers or customer service) see the post appear in their notification
-- bell in-portal and get an email pointing them to it.
--
-- Recipients deliberately exclude customer-service accounts even though
-- their saved role is "manager" (matching the Portal Access customer_service
-- profile - the same accounts already locked out of most manager pages).

BEGIN;

CREATE TABLE public.team_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  body text NOT NULL CHECK (length(trim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.team_post_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.team_posts(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  content_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_team_posts_updated_at
  BEFORE UPDATE ON public.team_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.team_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_post_attachments ENABLE ROW LEVEL SECURITY;

-- Read: internal staff only (admin, manager, rep).
CREATE POLICY "team_posts read internal staff" ON public.team_posts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'rep'));

-- Write: admin or manager. A manager can only edit/delete their own post; an
-- admin can edit/delete any.
CREATE POLICY "team_posts insert admin or manager" ON public.team_posts FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );
CREATE POLICY "team_posts update own or admin" ON public.team_posts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR (public.has_role(auth.uid(), 'manager') AND author_user_id = auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR (public.has_role(auth.uid(), 'manager') AND author_user_id = auth.uid()));
CREATE POLICY "team_posts delete own or admin" ON public.team_posts FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR (public.has_role(auth.uid(), 'manager') AND author_user_id = auth.uid()));

CREATE POLICY "team_post_attachments read internal staff" ON public.team_post_attachments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'rep'));
CREATE POLICY "team_post_attachments insert admin or manager" ON public.team_post_attachments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_posts p WHERE p.id = post_id AND p.author_user_id = auth.uid()
    )
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );
CREATE POLICY "team_post_attachments delete own or admin" ON public.team_post_attachments FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.team_posts p WHERE p.id = post_id AND p.author_user_id = auth.uid())
  );

REVOKE ALL ON public.team_posts, public.team_post_attachments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_posts, public.team_post_attachments TO authenticated;

-- Storage bucket for post attachments (images + PDFs), 10MB cap, mirroring
-- issue-report-attachments' RLS pattern.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'team-post-attachments',
  'team-post-attachments',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "team-post-attachments write admin or manager" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'team-post-attachments' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));
CREATE POLICY "team-post-attachments read internal staff" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'team-post-attachments' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'rep')));
CREATE POLICY "team-post-attachments delete admin or manager" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'team-post-attachments' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

-- Recipient list for the notify-team-post edge function (service-role only -
-- it returns email addresses, so it's not exposed to ordinary clients).
--
-- Mirrors useUserRole.ts's resolveRole() exactly - a plain "role IN
-- user_roles" check is NOT enough: most reps and managers are classified by
-- their user_reps/user_managers LINK, not an explicit user_roles row (an
-- earlier version of this function checked user_roles alone and silently
-- undercounted recipients from 23 to 8 - caught in a dry run before this
-- shipped). Priority: admin > manager > rep > dealer > default rep, same as
-- the app. "Internal staff" = that resolved role is admin/manager/rep, minus
-- anyone on the customer_service Portal Access profile (saved role
-- "manager" but treated separately everywhere else in the portal).
CREATE OR REPLACE FUNCTION public.team_post_recipients(p_exclude_user_id uuid)
RETURNS TABLE (user_id uuid, email text, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
  WITH resolved AS (
    SELECT
      u.id, u.email, p.full_name,
      CASE
        WHEN lower(u.email) IN ('justin@lineage-collections.com','scott@lineage-collections.com','andrew@lineage-collections.com','gabriella@lineage-collections.com')
          OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin') THEN 'admin'
        WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'manager')
          OR EXISTS (SELECT 1 FROM public.user_managers um WHERE um.user_id = u.id) THEN 'manager'
        WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'rep')
          OR EXISTS (SELECT 1 FROM public.user_reps ureps WHERE ureps.user_id = u.id) THEN 'rep'
        WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'dealer')
          OR EXISTS (SELECT 1 FROM public.user_dealers ud WHERE ud.user_id = u.id) THEN 'dealer'
        ELSE 'rep'
      END AS role
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.user_id = u.id
    WHERE u.deleted_at IS NULL AND u.id <> p_exclude_user_id
  )
  SELECT r.id, r.email::text, r.full_name
  FROM resolved r
  WHERE r.role IN ('admin', 'manager', 'rep')
    AND NOT EXISTS (SELECT 1 FROM public.portal_access_profiles pap WHERE pap.email = lower(r.email))
$$;

REVOKE ALL ON FUNCTION public.team_post_recipients(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.team_post_recipients(uuid) TO service_role;

-- Customer-service accounts are excluded from team_post_recipients (they
-- don't get notified), so they shouldn't be able to read the page either -
-- same "menu hides it, but the address still opens it" gap already fixed for
-- Pre-Sale and the other internal-only pages via a Portal Access override.
INSERT INTO public.page_access_role_overrides (page_key, profile, menu, route)
VALUES ('team-updates', 'customer_service', false, false);

COMMIT;
