-- New feature: admin/manager portals can see when each rep last logged in.
--
-- sign_in_log is admin-only via RLS ("Admins read sign-in log" policy), and
-- user_reps only exposes a caller's own row ("Users view own user_reps"), so
-- a manager querying either table directly from the client gets zero rows.
-- This SECURITY DEFINER RPC does the admin/manager scoping itself (same
-- pattern as current_manager_rep_ids()/assignable_users()) and returns one
-- row per rep the caller is allowed to see, with their most recent sign-in
-- timestamp (NULL if they've never signed in).

CREATE OR REPLACE FUNCTION public.get_rep_last_logins()
RETURNS TABLE(rep_id uuid, rep_name text, last_signed_in_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    sr.id AS rep_id,
    sr.name AS rep_name,
    MAX(sil.signed_in_at) AS last_signed_in_at
  FROM public.sales_reps sr
  LEFT JOIN public.user_reps ur ON ur.rep_id = sr.id
  LEFT JOIN public.sign_in_log sil ON sil.user_id = ur.user_id
  WHERE
    public.is_admin()
    OR sr.id IN (SELECT public.current_manager_rep_ids())
  GROUP BY sr.id, sr.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_rep_last_logins() TO authenticated;
