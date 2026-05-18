CREATE OR REPLACE FUNCTION public.assignable_users()
 RETURNS TABLE(user_id uuid, full_name text, email text, role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Admins
  SELECT ur.user_id,
         COALESCE(NULLIF(p.full_name, ''), split_part(u.email, '@', 1)) AS full_name,
         u.email::text,
         'admin'::text AS role
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  LEFT JOIN public.profiles p ON p.user_id = ur.user_id
  WHERE ur.role = 'admin'

  UNION

  -- Managers (mapped via email)
  SELECT u.id AS user_id,
         COALESCE(NULLIF(p.full_name, ''), m.name) AS full_name,
         u.email::text,
         'manager'::text AS role
  FROM public.managers m
  JOIN auth.users u ON lower(u.email) = lower(m.email)
  LEFT JOIN public.profiles p ON p.user_id = u.id

  UNION

  -- Sales reps (mapped via user_reps)
  SELECT ur2.user_id,
         COALESCE(NULLIF(p.full_name, ''), sr.name) AS full_name,
         u.email::text,
         'rep'::text AS role
  FROM public.user_reps ur2
  JOIN public.sales_reps sr ON sr.id = ur2.rep_id
  JOIN auth.users u ON u.id = ur2.user_id
  LEFT JOIN public.profiles p ON p.user_id = ur2.user_id

  UNION

  -- Customer service team (by email)
  SELECT u.id AS user_id,
         COALESCE(NULLIF(p.full_name, ''), initcap(split_part(u.email, '@', 1))) AS full_name,
         u.email::text,
         'rep'::text AS role
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE lower(u.email) IN (
    'tammy@lineage-collections.com',
    'jessica@lineage-collections.com',
    'melissa@lineage-collections.com',
    'michelle@lineage-collections.com',
    'miranda@lineage-collections.com',
    'sarah@lineage-collections.com'
  )
  ;
$function$;