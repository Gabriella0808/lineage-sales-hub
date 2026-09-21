-- Mateo De Lisa and Will Grisack should see the FULL Rep Login Activity
-- list (every rep, company-wide), not just their own team's reps like a
-- normal manager. Explicit, named, two-person exception -- requested
-- directly, not a general manager-role change. Mirrors the existing
-- pattern already used elsewhere in the app for named per-person
-- overrides (e.g. ADMIN_EMAIL_OVERRIDES in useUserRole.ts, allowEmails on
-- specific nav items) -- here at the RPC level since that's where this
-- page's scoping actually lives.
--
-- Verified in rolled-back transactions before writing this:
--   - As Mateo (mateo@lineage-collections.com): 15 reps (full list).
--   - As Will (will@lineage-collections.com): 15 reps (full list).
--   - Every other manager's scope is untouched -- this only adds an OR
--     branch; it doesn't change current_manager_rep_ids() or remove any
--     existing scoping for anyone else.

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
    (
      public.is_admin()
      OR sr.id IN (SELECT public.current_manager_rep_ids())
      OR lower(auth.email()) IN ('mateo@lineage-collections.com', 'will@lineage-collections.com')
    )
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
