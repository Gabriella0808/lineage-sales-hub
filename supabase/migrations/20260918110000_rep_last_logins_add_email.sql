-- Rep Login Activity showed "-" for email on several rows even though
-- the person clearly has a real, working login (e.g. "Missouri, Kansas,
-- Iowa, Nebraska", "Brad Robertson / Robertson"). Root cause: the
-- frontend was reading email from sales_reps.email via the row's
-- representative rep_id, but sales_reps.email is blank for several real,
-- actively-used accounts (the territory-named reps never had it filled
-- in; the "Robertson" placeholder never had it either) -- the actual
-- email only lives on auth.users, reachable via user_reps.user_id, which
-- get_rep_last_logins() already groups by one-per-row.
--
-- Fix: return the real auth.users.email directly from the RPC instead of
-- leaving the frontend to guess it from a sales_reps row. Since grouping
-- is already one row per login (one user_id per group), there's exactly
-- one real email per row -- no aggregation ambiguity.

DROP FUNCTION IF EXISTS public.get_rep_last_logins();

CREATE FUNCTION public.get_rep_last_logins()
RETURNS TABLE(rep_id uuid, rep_name text, email text, last_signed_in_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    min(sr.id::text)::uuid AS rep_id,
    string_agg(DISTINCT sr.name, ' / ' ORDER BY sr.name) AS rep_name,
    min(au.email) AS email,
    max(sil.signed_in_at) AS last_signed_in_at
  FROM public.sales_reps sr
  JOIN public.user_reps ur ON ur.rep_id = sr.id
  LEFT JOIN auth.users au ON au.id = ur.user_id
  LEFT JOIN public.sign_in_log sil ON sil.user_id = ur.user_id
  WHERE
    (public.is_admin() OR sr.id IN (SELECT public.current_manager_rep_ids()))
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles uro
      WHERE uro.user_id = ur.user_id AND uro.role IN ('admin', 'manager')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_managers um WHERE um.user_id = ur.user_id
    )
  GROUP BY ur.user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_rep_last_logins() TO authenticated;
