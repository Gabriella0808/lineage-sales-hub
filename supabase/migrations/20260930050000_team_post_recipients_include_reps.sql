-- Reps now get the Team Updates email/notification too, even though the
-- page itself is still admin/manager-only for viewing (see pageAccess.ts's
-- "team-updates" entry and the RLS read policies) - this widens ONLY the
-- recipient list, not who can open the page.

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
  WHERE r.role IN ('admin', 'manager', 'rep')
    AND NOT EXISTS (SELECT 1 FROM public.portal_access_profiles pap WHERE pap.email = lower(r.email))
$function$;
