-- Team Updates is going live for everyone except reps, for now (page access
-- widens from Gabriella-only testing to admin+manager - see pageAccess.ts).
-- These read policies previously included 'rep' alongside admin/manager;
-- drop rep from all of them so this is enforced at the RLS level too, not
-- just hidden from the nav/route. Write policies were already admin/manager
-- only, so nothing changes there.

BEGIN;

DROP POLICY "team_posts read internal staff" ON public.team_posts;
CREATE POLICY "team_posts read internal staff" ON public.team_posts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP POLICY "team_post_attachments read internal staff" ON public.team_post_attachments;
CREATE POLICY "team_post_attachments read internal staff" ON public.team_post_attachments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP POLICY "team_post_reactions read internal staff" ON public.team_post_reactions;
CREATE POLICY "team_post_reactions read internal staff" ON public.team_post_reactions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP POLICY "team_post_reactions insert own" ON public.team_post_reactions;
CREATE POLICY "team_post_reactions insert own" ON public.team_post_reactions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

DROP POLICY "team-post-attachments read internal staff" ON storage.objects;
CREATE POLICY "team-post-attachments read internal staff" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'team-post-attachments' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

-- Not used yet (RECIPIENT_MODE in notify-team-post is still "gabriella-only"
-- while emails stay test-scoped), but updated now for consistency so it's
-- already correct whenever that's flipped later.
CREATE OR REPLACE FUNCTION public.team_post_recipients(p_exclude_user_id uuid)
RETURNS TABLE(user_id uuid, email text, full_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
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
  WHERE r.role IN ('admin', 'manager')
    AND NOT EXISTS (SELECT 1 FROM public.portal_access_profiles pap WHERE pap.email = lower(r.email))
$function$;

COMMIT;
