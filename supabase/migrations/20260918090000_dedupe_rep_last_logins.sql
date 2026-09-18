-- Fix: Rep Login Activity showed obvious duplicates, e.g. a bare "Jones"
-- row next to the real "Kate Jones" row, a bare "Robertson" row next to
-- "Brad Robertson", and Jordan Shindell's two territory records
-- ("Shindell - PA/OH" / "Shindell- Beach") both showing the same login
-- time as if they were two different people.
--
-- Two separate root causes, both fixed here:
--
-- 1. Bare placeholder sales_reps rows (no acctivate_id, no email --
--    "Jones", "Robertson", "Jordan Shindell", "Alex Beyer", "Accomodation",
--    etc: 12 of the 29 rows) are leftover ghost records from the
--    duplicate-rep-row pattern fixed repeatedly earlier today (see
--    20260917070000, 20260918000000, 20260918010000). Their dealer links
--    were already repointed to the real rows; the bare rows themselves
--    were deliberately left in place at the time since they were harmless
--    for dealer/rep reporting. They aren't harmless here -- excluded via
--    the same NULLIF(acctivate_id,'') IS NOT NULL filter already used
--    elsewhere (e.g. get_portal_dealer_rep_reporting_lines) to identify a
--    "real" rep record.
--
-- 2. Genuine multi-territory reps (one login, multiple sales_reps rows --
--    Jordan Shindell has "Shindell - PA/OH" and "Shindell- Beach", added
--    deliberately in 20260914001000/20260915020000) previously showed as
--    two identical-looking rows. Fixed via connected-component grouping:
--    two rep rows merge into one displayed row only if some login links
--    to both. This also correctly leaves them SEPARATE under manager
--    scoping when they report to different managers (confirmed live:
--    Shindell - PA/OH -> Mateo De Lisa, Shindell- Beach -> Will Grisack --
--    each manager should only see their own slice, and now does).
--
--    The reverse case -- one rep record shared by two different logins
--    (Brad Robertson + Leighton Robertson, "work as one sales team" per
--    20260915020000) -- is handled by the same grouping: it collapses
--    back to one "Brad Robertson" row (MAX of both logins' last sign-in),
--    matching the original single-login-per-rep behavior instead of
--    incorrectly splitting into two "Brad Robertson" rows (which an
--    earlier, simpler group-by-login draft of this fix did -- caught and
--    corrected before this was written).
--
-- Also restricts the list to reps that actually have a portal account
-- (a public.user_reps row -- the same link Settings > User Management
-- creates when an admin assigns a login to a rep). Reps with no account
-- at all (e.g. "Kate Jones", "House", "IL-WI (open)", "Arkansas (open)",
-- "Sergio Hospitality", "BrandJump" -- confirmed via direct query: zero
-- user_reps rows, not just zero sign-ins) were cluttering the list as
-- permanent "Never logged in" rows with nothing meaningful to show.
--
-- NOTE: this version was superseded a few minutes later by
-- 20260918100000, which switched the grouping unit from "sales_reps
-- record" to "login" after discovering the acctivate_id filter used
-- here wrongly excluded real reps whose acctivate_id sync field is
-- blank (e.g. the Illinois/Wisconsin/Minnesota/Dakotas and Missouri/
-- Kansas/Iowa/Nebraska territory reps, who do have real accounts). Left
-- in the migration history as-applied rather than rewritten in place.

CREATE OR REPLACE FUNCTION public.get_rep_last_logins()
RETURNS TABLE(rep_id uuid, rep_name text, last_signed_in_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH base AS (
    SELECT
      sr.id AS rep_id,
      sr.name AS rep_name,
      ur.user_id,
      sil.signed_in_at
    FROM public.sales_reps sr
    JOIN public.user_reps ur ON ur.rep_id = sr.id
    LEFT JOIN public.sign_in_log sil ON sil.user_id = ur.user_id
    WHERE
      NULLIF(TRIM(sr.acctivate_id), '') IS NOT NULL
      AND (
        public.is_admin()
        OR sr.id IN (SELECT public.current_manager_rep_ids())
      )
  ),
  edges AS (
    SELECT DISTINCT a.rep_id AS a_id, b.rep_id AS b_id
    FROM base a
    JOIN base b ON a.user_id = b.user_id AND a.user_id IS NOT NULL AND a.rep_id <> b.rep_id
  ),
  clusters AS (
    WITH RECURSIVE c AS (
      SELECT rep_id, rep_id::text AS label FROM (SELECT DISTINCT rep_id FROM base) r
      UNION
      SELECT c.rep_id, LEAST(c.label, e.b_id::text)
      FROM c
      JOIN edges e ON e.a_id::text = c.label
      WHERE e.b_id::text < c.label
    )
    SELECT * FROM c
  ),
  final_labels AS (
    SELECT rep_id, min(label) AS cluster_label
    FROM clusters
    GROUP BY rep_id
  )
  SELECT
    min(b.rep_id::text)::uuid AS rep_id,
    string_agg(DISTINCT b.rep_name, ' / ' ORDER BY b.rep_name) AS rep_name,
    max(b.signed_in_at) AS last_signed_in_at
  FROM base b
  JOIN final_labels fl ON fl.rep_id = b.rep_id
  GROUP BY fl.cluster_label;
$$;
