-- "Seen by X of Y" still counted Y as admin/manager only, a leftover from
-- before Team Updates opened to reps (20260930060000). Reps can now view
-- and react, so they belong in the real audience total too.

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
  WHERE r.role IN ('admin', 'manager', 'rep')
    AND NOT EXISTS (SELECT 1 FROM public.portal_access_profiles pap WHERE pap.email = lower(r.email))
$function$;
