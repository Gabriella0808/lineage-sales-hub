-- Corrects 20260918090000: that version grouped by sales_reps record and
-- excluded any row with a blank acctivate_id, on the assumption a blank
-- acctivate_id meant "leftover placeholder ghost row." That assumption
-- was wrong -- it also matched real reps whose acctivate_id sync field
-- just happens to be empty (the "Illinois, Wisconsin, Minnesota and
-- Dakotas" and "Missouri, Kansas, Iowa, Nebraska" territory reps both
-- have real, actively-used portal accounts with a blank acctivate_id),
-- so the page under-counted: 11 rows shown instead of the real 15.
--
-- The correct unit was never "sales_reps record with a real-looking
-- acctivate_id" -- it's "a real person who can log in," i.e. one row per
-- distinct public.user_reps.user_id. Grouping by login instead of by rep
-- record handles every case correctly with no acctivate_id guessing:
--   - Jordan Shindell's two territory records share one login -> already
--     collapse to one row ("Shindell - PA/OH / Shindell- Beach").
--   - Leighton Robertson's login is linked to both the bare "Robertson"
--     placeholder and the real "Brad Robertson" record (by design, see
--     20260915020000) -> one row ("Brad Robertson / Robertson"), and
--     Brad's own separate login stays its own separate row -- they're
--     two different people, so two different last-login times is
--     correct, not a duplicate.
--   - The Illinois/Wisconsin/Missouri territory reps, blank acctivate_id
--     and all, now show up correctly since the filter is "has a login,"
--     not "has an acctivate_id."
--
-- Also makes the role restriction explicit rather than incidental:
-- excludes any login that also carries an admin/manager role or a
-- user_managers link, mirroring the same admin > manager > rep
-- precedence useUserRole.ts already applies client-side. None of the
-- current 15 rep logins hit this case today, but nothing here relied on
-- that staying true by luck.
--
-- Validated in a rolled-back transaction against live data: exactly 15
-- rows for admin, matching a manual count of rep-role accounts in
-- Settings > User Management; manager scoping (tested as Mateo De Lisa)
-- still correctly keeps Shindell - PA/OH split from Shindell- Beach,
-- since those two territories report to different managers.

CREATE OR REPLACE FUNCTION public.get_rep_last_logins()
RETURNS TABLE(rep_id uuid, rep_name text, last_signed_in_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    min(sr.id::text)::uuid AS rep_id,
    string_agg(DISTINCT sr.name, ' / ' ORDER BY sr.name) AS rep_name,
    max(sil.signed_in_at) AS last_signed_in_at
  FROM public.sales_reps sr
  JOIN public.user_reps ur ON ur.rep_id = sr.id
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
