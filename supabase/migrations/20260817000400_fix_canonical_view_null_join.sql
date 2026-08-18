-- ============================================================================
-- Fix: Canonical reporting view — strict null/empty join guards
-- ============================================================================
--
-- Root cause (confirmed by validation):
--
--   1. Territory entries in sales_reps (e.g. "Arkansas", "Old South Florida
--      Territory") with acctivate_id = NULL were appearing under managers
--      because the previous view join only guarded the sales_reps side with
--      `IS NOT NULL / <> ''` but allowed a COALESCE-empty-string path on the
--      reporting-view side to produce a match when SalespersonID is blank.
--
--   2. COALESCE(NULLIF(TRIM(a.rep_id), ''), '') = ANY(p_rep_ac_ids) in the
--      RPC filter could match the empty string against an empty array element,
--      silently pulling in rows with no rep assignment.
--
--   3. Reporting rows with rep_id = raw UUID (bookings where salesperson lookup
--      missed) or rep_id = territory name ("Arkansas", "SoFlo", etc.) must
--      remain manager_id = NULL (unassigned), never attributed to any manager.
--
-- Fix strategy:
--
--   A. real_reps CTE: includes ONLY sales_reps entries where:
--      • acctivate_id is non-NULL and non-empty       (NULLIF guard)
--      • the rep name does NOT match any territory name (territories table
--        cross-check — second line of defence for any row that somehow has a
--        non-empty acctivate_id but is still a territory)
--
--   B. Left join from reporting lines to real_reps: fires ONLY when
--      rl.rep_id is also non-NULL and non-empty (NULLIF guard on both sides).
--      This means rows with blank/NULL/GUID rep_id always get manager_id = NULL.
--
--   C. All RPC rep_id filters: replaced with explicit NULLIF guard so an
--      empty rep_id can never match a non-empty acctivate_id value.
--
-- Do not change: source data, booking formula, invoice formula, 2025 actuals,
--   projections, mat view contents, Jan–Jul 2026 invoice source selection.
--   The Jan–Jul hide rule applies only to Live KPI bookings display (frontend),
--   never to DB-level filtering.
-- ============================================================================


-- ── 1. Canonical reporting view (fixed) ──────────────────────────────────────

CREATE OR REPLACE VIEW public.v_companywide_reporting_actuals AS
WITH real_reps AS (
  -- Portal rep entries eligible for canonical matching.
  -- EXCLUDES:
  --   • Entries with NULL or blank acctivate_id (territories, pseudo-reps).
  --   • Entries whose portal name matches a territory name in the territories
  --     table (defence against any territory row that has a stale acctivate_id).
  SELECT
    sr.id           AS portal_rep_id,
    sr.name         AS canonical_rep_name,
    sr.acctivate_id AS canonical_rep_key,
    sr.manager_id
  FROM public.sales_reps sr
  WHERE
    -- Primary guard: acctivate_id must be a real non-empty Acctivate rep code.
    NULLIF(TRIM(sr.acctivate_id), '') IS NOT NULL
    -- Secondary guard: exclude any sales_reps row whose name matches a
    -- territory record (e.g. "Arkansas", "Old South Florida Territory").
    AND NOT EXISTS (
      SELECT 1
      FROM public.territories t
      WHERE LOWER(TRIM(t.name)) = LOWER(TRIM(sr.name))
    )
)
SELECT
  rl.metric_type,
  rl.transaction_date,
  rl.year,
  rl.month_number,
  rl.dealer_name,
  rl.customer_id,
  rl.rep_id,
  rl.rep_name,
  rl.sku,
  rl.description,
  rl.brand_category,
  rl.amount,
  rl.invoice_number,
  -- NULL when rep_id is blank/UUID/territory — never coerced to a false match.
  rr.portal_rep_id,
  rr.canonical_rep_name,
  rr.canonical_rep_key,
  rr.manager_id,
  m.name AS manager_name
FROM public.v_portal_dealer_rep_reporting_lines rl
LEFT JOIN real_reps rr
  ON
    -- Both sides must be non-empty. This is the critical guard:
    --   • Blank/NULL rep_id rows (GUIDs, missing salesperson) → manager_id = NULL
    --   • Territory acctivate_id rows already excluded from real_reps above
    NULLIF(TRIM(rl.rep_id), '') IS NOT NULL
    AND LOWER(TRIM(rr.canonical_rep_key)) = LOWER(TRIM(rl.rep_id))
LEFT JOIN public.managers m ON m.id = rr.manager_id;

GRANT SELECT ON public.v_companywide_reporting_actuals TO anon, authenticated;

COMMENT ON VIEW public.v_companywide_reporting_actuals IS
  'Acctivate-derived booking and invoice lines with canonical portal rep/manager
   identity attached. The join is strict: both rl.rep_id and sr.acctivate_id must
   be non-NULL and non-empty, and territory entries are excluded from sales_reps
   via a cross-check against the territories table. Rows with blank/NULL/GUID
   rep_id remain manager_id = NULL (unassigned) and never appear under any manager
   filter. Safe to filter on manager_id = <uuid> for manager-scoped reporting.';


-- ── 2. Monthly aggregation RPC (fixed rep_id guard) ───────────────────────────

CREATE OR REPLACE FUNCTION public.get_manager_reporting_monthly(
  p_manager_id uuid     DEFAULT NULL,  -- NULL = all managers (company-wide)
  p_rep_ac_ids text[]   DEFAULT NULL,  -- specific Acctivate rep codes; overrides manager
  p_years      int[]    DEFAULT NULL   -- e.g. ARRAY[2025, 2026]; NULL = all years
)
RETURNS TABLE (
  metric_type  text,
  year         int,
  month_number int,
  total_amount numeric,
  row_count    bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.metric_type,
    a.year,
    a.month_number,
    COALESCE(SUM(a.amount), 0) AS total_amount,
    COUNT(*)                   AS row_count
  FROM public.v_companywide_reporting_actuals a
  WHERE
    (p_years IS NULL OR a.year = ANY(p_years))
    AND (
      -- Rep-level override: match explicit Acctivate rep codes.
      -- Guard: rep_id must be non-empty (NULLIF) so blank rows never match.
      (p_rep_ac_ids IS NOT NULL
        AND NULLIF(TRIM(a.rep_id), '') IS NOT NULL
        AND LOWER(TRIM(a.rep_id)) = ANY(
          SELECT LOWER(TRIM(x)) FROM unnest(p_rep_ac_ids) AS x
          WHERE NULLIF(TRIM(x), '') IS NOT NULL
        ))
      OR
      -- Manager-level: filter by manager_id in the view (already NULL-safe
      -- because the view only sets manager_id for real matched reps).
      (p_rep_ac_ids IS NULL
        AND (p_manager_id IS NULL OR a.manager_id = p_manager_id))
    )
  GROUP BY 1, 2, 3
  ORDER BY 1, 2, 3;
$$;

GRANT EXECUTE ON FUNCTION public.get_manager_reporting_monthly(uuid, text[], int[])
  TO anon, authenticated, service_role;


-- ── 3a. Grouped rows RPC (fixed rep_ids filter) ───────────────────────────────

CREATE OR REPLACE FUNCTION public.get_sales_reporting_grouped_rows(
  p_metric       text,
  p_group_by     text,
  p_from         date,
  p_to           date,
  p_comp_from    date    DEFAULT NULL,
  p_comp_to      date    DEFAULT NULL,
  p_customer_ids text[]  DEFAULT NULL,
  p_brand_cats   text[]  DEFAULT NULL,
  p_skus         text[]  DEFAULT NULL,
  p_rep_ids      text[]  DEFAULT NULL,
  p_manager_id   uuid    DEFAULT NULL
)
RETURNS TABLE (
  entity_key    text,
  primary_amt   numeric,
  primary_lines bigint,
  comp_amt      numeric,
  comp_lines    bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH src AS (
    SELECT
      CASE
        WHEN p_group_by = 'dealer'
        THEN COALESCE(NULLIF(TRIM(a.dealer_name::text), ''), a.customer_id::text, 'Unknown')
        ELSE COALESCE(NULLIF(TRIM(a.rep_id::text), ''), NULLIF(TRIM(a.rep_name::text), ''), 'Unassigned')
      END         AS entity_key,
      a.amount,
      a.transaction_date
    FROM public.v_companywide_reporting_actuals a
    WHERE a.metric_type = p_metric
      AND a.transaction_date >= LEAST(p_from, COALESCE(p_comp_from, p_from))
      AND a.transaction_date <= GREATEST(p_to, COALESCE(p_comp_to, p_to))
      -- Canonical manager filter: manager_id already NULL-safe in the view.
      AND (p_manager_id IS NULL OR a.manager_id = p_manager_id)
      -- Territory / specific dealer sub-filter.
      AND (p_customer_ids IS NULL
           OR lower(a.customer_id::text) = ANY(p_customer_ids))
      AND (p_brand_cats IS NULL
           OR array_length(p_brand_cats, 1) IS NULL
           OR COALESCE(
                a.brand_category,
                CASE WHEN p_metric = 'invoiced' THEN 'Historical Invoice' ELSE '' END
              ) = ANY(p_brand_cats))
      AND (p_skus IS NULL
           OR array_length(p_skus, 1) IS NULL
           OR a.sku = ANY(p_skus))
      -- Rep filter: explicit NULLIF guard — a blank/NULL rep_id can never
      -- match a non-empty acctivate_id value supplied by the caller.
      AND (p_rep_ids IS NULL
           OR (
             NULLIF(TRIM(a.rep_id::text), '') IS NOT NULL
             AND lower(TRIM(a.rep_id::text)) = ANY(p_rep_ids)
           ))
  )
  SELECT
    entity_key,
    COALESCE(SUM(amount) FILTER (
      WHERE transaction_date BETWEEN p_from AND p_to
    ), 0)::numeric  AS primary_amt,
    COALESCE(COUNT(*) FILTER (
      WHERE transaction_date BETWEEN p_from AND p_to
    ), 0)::bigint   AS primary_lines,
    COALESCE(SUM(amount) FILTER (
      WHERE p_comp_from IS NOT NULL
        AND transaction_date BETWEEN p_comp_from AND p_comp_to
    ), 0)::numeric  AS comp_amt,
    COALESCE(COUNT(*) FILTER (
      WHERE p_comp_from IS NOT NULL
        AND transaction_date BETWEEN p_comp_from AND p_comp_to
    ), 0)::bigint   AS comp_lines
  FROM src
  GROUP BY entity_key
  HAVING
    COALESCE(SUM(amount) FILTER (
      WHERE transaction_date BETWEEN p_from AND p_to
    ), 0) != 0
    OR COALESCE(SUM(amount) FILTER (
      WHERE p_comp_from IS NOT NULL
        AND transaction_date BETWEEN p_comp_from AND p_comp_to
    ), 0) != 0
  ORDER BY 2 DESC NULLS LAST
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_reporting_grouped_rows(
  text, text, date, date, date, date, text[], text[], text[], text[], uuid
) TO authenticated, anon, service_role;


-- ── 3b. Detail lines RPC (fixed rep_ids filter) ───────────────────────────────

CREATE OR REPLACE FUNCTION public.get_sales_reporting_detail_lines(
  p_metric       text,
  p_group_by     text,
  p_entity_key   text,
  p_from         date,
  p_to           date,
  p_customer_ids text[]  DEFAULT NULL,
  p_brand_cats   text[]  DEFAULT NULL,
  p_skus         text[]  DEFAULT NULL,
  p_rep_ids      text[]  DEFAULT NULL,
  p_limit        int     DEFAULT 200,
  p_offset       int     DEFAULT 0,
  p_manager_id   uuid    DEFAULT NULL
)
RETURNS TABLE (
  transaction_date date,
  invoice_number   text,
  dealer_name      text,
  rep_name         text,
  rep_id           text,
  customer_id      text,
  sku              text,
  description      text,
  brand_category   text,
  amount           numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    a.transaction_date,
    a.invoice_number::text,
    a.dealer_name::text,
    a.rep_name::text,
    a.rep_id::text,
    a.customer_id::text,
    a.sku::text,
    a.description::text,
    a.brand_category::text,
    a.amount::numeric
  FROM public.v_companywide_reporting_actuals a
  WHERE a.metric_type = p_metric
    AND a.transaction_date BETWEEN p_from AND p_to
    AND (
      (p_group_by = 'dealer'
       AND COALESCE(NULLIF(TRIM(a.dealer_name::text), ''), a.customer_id::text, 'Unknown') = p_entity_key)
      OR
      (p_group_by = 'rep'
       AND COALESCE(NULLIF(TRIM(a.rep_id::text), ''), NULLIF(TRIM(a.rep_name::text), ''), 'Unassigned') = p_entity_key)
    )
    AND (p_manager_id IS NULL OR a.manager_id = p_manager_id)
    AND (p_customer_ids IS NULL
         OR lower(a.customer_id::text) = ANY(p_customer_ids))
    AND (p_brand_cats IS NULL
         OR array_length(p_brand_cats, 1) IS NULL
         OR COALESCE(
              a.brand_category,
              CASE WHEN p_metric = 'invoiced' THEN 'Historical Invoice' ELSE '' END
            ) = ANY(p_brand_cats))
    AND (p_skus IS NULL
         OR array_length(p_skus, 1) IS NULL
         OR a.sku = ANY(p_skus))
    -- Rep filter: same NULLIF guard as grouped rows.
    AND (p_rep_ids IS NULL
         OR (
           NULLIF(TRIM(a.rep_id::text), '') IS NOT NULL
           AND lower(TRIM(a.rep_id::text)) = ANY(p_rep_ids)
         ))
  ORDER BY a.transaction_date DESC, a.invoice_number NULLS LAST
  LIMIT  p_limit
  OFFSET p_offset
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_reporting_detail_lines(
  text, text, text, date, date, text[], text[], text[], text[], int, int, uuid
) TO authenticated, anon, service_role;
