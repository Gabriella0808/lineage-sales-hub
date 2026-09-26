-- Read-only listing of portal users with their roles and links, for the
-- "Portal Access" admin page. The browser cannot read auth.users directly, so
-- this SECURITY DEFINER function does it - and refuses everyone except
-- Gabriella's account (checked here in the database, not just in the UI).
-- Purely additive: creates one function, changes no data.

CREATE OR REPLACE FUNCTION public.admin_list_portal_users()
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  roles text[],
  manager_names text[],
  rep_names text[],
  has_manager_link boolean,
  has_rep_link boolean,
  has_dealer_link boolean,
  last_sign_in_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF lower(coalesce(auth.email(), '')) <> 'gabriella@lineage-collections.com' THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    p.full_name,
    coalesce((SELECT array_agg(DISTINCT ur.role::text ORDER BY ur.role::text) FROM public.user_roles ur WHERE ur.user_id = u.id), ARRAY[]::text[]),
    coalesce((SELECT array_agg(DISTINCT m.name ORDER BY m.name) FROM public.user_managers um JOIN public.managers m ON m.id = um.manager_id WHERE um.user_id = u.id), ARRAY[]::text[]),
    coalesce((SELECT array_agg(DISTINCT r.name ORDER BY r.name) FROM public.user_reps ureps JOIN public.sales_reps r ON r.id = ureps.rep_id WHERE ureps.user_id = u.id), ARRAY[]::text[]),
    EXISTS (SELECT 1 FROM public.user_managers um WHERE um.user_id = u.id),
    EXISTS (SELECT 1 FROM public.user_reps ureps WHERE ureps.user_id = u.id),
    EXISTS (SELECT 1 FROM public.user_dealers ud WHERE ud.user_id = u.id),
    u.last_sign_in_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  WHERE u.deleted_at IS NULL
  ORDER BY lower(u.email);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_portal_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_portal_users() TO authenticated;
