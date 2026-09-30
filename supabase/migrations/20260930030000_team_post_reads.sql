-- "Seen by" was entirely sourced from notifications.read_at, which only has
-- a row per person notify-team-post actually emailed - while RECIPIENT_MODE
-- stays "gabriella-only", that's just Gabriella, so anyone else with page
-- access (any other admin/manager) could open Team Updates and read every
-- post and it would never register as a view at all. This decouples "seen"
-- from the recipient list entirely: a dedicated row per (post, viewer),
-- written whenever someone actually has the post loaded on their screen,
-- regardless of whether they were ever emailed about it.

BEGIN;

CREATE TABLE public.team_post_reads (
  post_id uuid NOT NULL REFERENCES public.team_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

ALTER TABLE public.team_post_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_post_reads read internal staff" ON public.team_post_reads FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "team_post_reads insert own" ON public.team_post_reads FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  );

CREATE POLICY "team_post_reads update own" ON public.team_post_reads FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.team_post_reads FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.team_post_reads TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.team_post_reads;

-- "Seen by X of Y" needs a Y - how many people COULD see this, independent
-- of who's actually been emailed. Mirrors team_post_recipients()'s own
-- role-resolution logic (see its comment for why this can't just check
-- user_roles), but only needs a count, and is callable by any authenticated
-- staff member directly (not just service role) since the client renders it.
CREATE OR REPLACE FUNCTION public.team_post_audience_size()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
  WITH resolved AS (
    SELECT
      u.id, u.email,
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
    WHERE u.deleted_at IS NULL
  )
  SELECT count(*)::integer
  FROM resolved r
  WHERE r.role IN ('admin', 'manager')
    AND NOT EXISTS (SELECT 1 FROM public.portal_access_profiles pap WHERE pap.email = lower(r.email))
$function$;

GRANT EXECUTE ON FUNCTION public.team_post_audience_size() TO authenticated;

COMMIT;
