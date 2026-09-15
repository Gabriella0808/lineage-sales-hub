CREATE OR REPLACE FUNCTION public.assignable_users()
 RETURNS TABLE(user_id uuid, full_name text, email text, role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (user_id) user_id, full_name, email, role
  FROM (
    -- Admins (priority 1) - staff callers only
    SELECT ur.user_id,
           COALESCE(NULLIF(p.full_name, ''), split_part(u.email, '@', 1)) AS full_name,
           u.email::text, 'admin'::text AS role, 1 AS priority
    FROM public.user_roles ur
    JOIN auth.users u ON u.id = ur.user_id
    LEFT JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.role = 'admin'
      AND (public.is_admin() OR public.current_manager_id() IS NOT NULL)

    UNION ALL

    -- Managers matched by email (priority 2) - staff callers only
    SELECT u.id AS user_id,
           COALESCE(NULLIF(p.full_name, ''), m.name) AS full_name,
           u.email::text, 'manager'::text AS role, 2 AS priority
    FROM public.managers m
    JOIN auth.users u ON lower(u.email) = lower(m.email)
    LEFT JOIN public.profiles p ON p.user_id = u.id
    WHERE (public.is_admin() OR public.current_manager_id() IS NOT NULL)

    UNION ALL

    -- Customer service team (priority 3) - staff callers only
    SELECT u.id AS user_id,
           COALESCE(NULLIF(p.full_name, ''), initcap(split_part(u.email, '@', 1))) AS full_name,
           u.email::text, 'rep'::text AS role, 3 AS priority
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.user_id = u.id
    WHERE lower(u.email) IN ('tammy@lineage-collections.com', 'jessica@lineage-collections.com', 'melissa@lineage-collections.com', 'michelle@lineage-collections.com', 'miranda@lineage-collections.com', 'sarah@lineage-collections.com')
      AND (public.is_admin() OR public.current_manager_id() IS NOT NULL)

    UNION ALL

    -- NEW: a rep caller only sees their own manager
    SELECT u.id AS user_id,
           COALESCE(NULLIF(p.full_name, ''), m.name) AS full_name,
           u.email::text, 'manager'::text AS role, 1 AS priority
    FROM public.sales_reps sr
    JOIN public.managers m ON m.id = sr.manager_id
    JOIN auth.users u ON lower(u.email) = lower(m.email)
    LEFT JOIN public.profiles p ON p.user_id = u.id
    WHERE NOT (public.is_admin() OR public.current_manager_id() IS NOT NULL)
      AND sr.id IN (SELECT public.current_rep_ids())
  ) ranked
  ORDER BY user_id, priority
$function$;
