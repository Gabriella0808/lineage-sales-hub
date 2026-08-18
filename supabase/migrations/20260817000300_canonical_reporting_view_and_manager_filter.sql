-- ============================================================================
-- Canonical Reporting View + Manager-Aware RPCs
-- ============================================================================
--
-- Root cause of manager filter failures:
--   1. Live KPI resolved manager → reps via display-name fuzzy matching
--      (resolveRepIdentifiers). One dropped match = one rep's data missing.
--   2. SalesReporting scoped by dealers.rep_id → dealers.acctivate_id
--      (customer-based indirection). Misses orders where the Acctivate
--      SalespersonID belongs to the manager's rep but the dealer is not
--      formally assigned to them in the portal.
--
-- Fix: join Acctivate-derived reporting rows directly to the portal's
-- rep/manager assignment tables via the stable Acctivate SalespersonID.
--
--   v_portal_dealer_rep_reporting_lines.rep_id
--     = sales_reps.acctivate_id          (case-insensitive)
--     → sales_reps.manager_id
--     = managers.id
--
-- Then pass managers.id (the UUID already in the URL) directly to all RPCs.
-- No frontend name resolution. No dealer indirection.
--
-- Do not change: source data, booking formula, invoice formula, 2025 actuals,
--   projections, mat view contents, Jan–Jul invoice source selection.
-- ============================================================================


-- ── 1. Canonical reporting view ──────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_companywide_reporting_actuals;

CREATE VIEW public.v_companywide_reporting_actuals AS
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
  -- Portal canonical rep/manager (NULL when Acctivate rep not in sales_reps)
  sr.id           AS portal_rep_id,
  sr.name         AS canonical_rep_name,
  sr.acctivate_id AS canonical_rep_key,
  m.id            AS manager_id,
  m.name          AS manager_name
FROM public.v_portal_dealer_rep_reporting_lines rl
LEFT JOIN public.sales_reps sr
  ON  sr.acctivate_id IS NOT NULL
  AND sr.acctivate_id <> ''
  AND LOWER(TRIM(sr.acctivate_id)) = LOWER(TRIM(rl.rep_id))
LEFT JOIN public.managers m ON m.id = sr.manager_id;

GRANT SELECT ON public.v_companywide_reporting_actuals TO anon, authenticated;

COMMENT ON VIEW public.v_companywide_reporting_actuals IS
  'Acctivate-derived booking and invoice lines with canonical portal rep/manager
   identity attached. Filter by manager_id for manager-scoped reporting without
   any frontend name resolution or dealer-based indirection.';


-- ── 2. Monthly aggregation RPC for Live KPI ──────────────────────────────────
--
-- Replaces the multi-step frontend chain:
--   display names → fuzzy match → Acctivate IDs → view filter
-- With a single DB call:
--   manager_id → canonical join → aggregate

DROP FUNCTION IF EXISTS public.get_manager_reporting_monthly(uuid, text[], int[]);

CREATE OR REPLACE FUNCTION public.get_manager_reporting_monthly(
  p_manager_id uuid     DEFAULT NULL,  -- NULL = all managers
  p_rep_ac_ids text[]   DEFAULT NULL,  -- specific Acctivate rep IDs; overrides manager
  p_years      int[]    DEFAULT NULL   -- e.g., ARRAY[2025, 2026]; NULL = all years
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
      -- Rep-level override: filter by explicit Acctivate rep IDs
      (p_rep_ac_ids IS NOT NULL
        AND LOWER(TRIM(a.rep_id)) = ANY(
          SELECT LOWER(TRIM(x)) FROM unnest(p_rep_ac_ids) AS x
        ))
      OR
      -- Manager-level: filter by manager_id (or all if NULL)
      (p_rep_ac_ids IS NULL
        AND (p_manager_id IS NULL OR a.manager_id = p_manager_id))
    )
  GROUP BY 1, 2, 3
  ORDER BY 1, 2, 3;
$$;

GRANT EXECUTE ON FUNCTION public.get_manager_reporting_monthly(uuid, text[], int[])
  TO anon, authenticated, service_role;


-- ── 3. Update SalesReporting RPCs: add p_manager_id parameter ────────────────
--
-- Dealer Reporting and Rep Reporting now pass the manager UUID directly.
-- The new p_manager_id parameter defaults to NULL (backward-compatible: existing
-- callers that omit it get company-wide behaviour). The old 10/11-param signatures
-- are dropped so there is no ambiguity.

-- 3a. get_sales_reporting_grouped_rows (add p_manager_id as 11th param)

DROP FUNCTION IF EXISTS public.get_sales_reporting_grouped_rows(
  text, text, date, date, date, date, text[], text[], text[], text[]
);

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
      -- Canonical manager filter (replaces customer-id-based manager scope)
      AND (p_manager_id IS NULL OR a.manager_id = p_manager_id)
      -- Sub-scope filters (territory / specific dealer selection)
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
      AND (p_rep_ids IS NULL
           OR lower(COALESCE(NULLIF(TRIM(a.rep_id::text), ''), '')) = ANY(p_rep_ids))
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


-- 3b. get_sales_reporting_detail_lines (add p_manager_id as 12th param)

DROP FUNCTION IF EXISTS public.get_sales_reporting_detail_lines(
  text, text, text, date, date, text[], text[], text[], text[], int, int
);

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
    AND (p_rep_ids IS NULL
         OR lower(COALESCE(NULLIF(TRIM(a.rep_id::text), ''), '')) = ANY(p_rep_ids))
  ORDER BY a.transaction_date DESC, a.invoice_number NULLS LAST
  LIMIT  p_limit
  OFFSET p_offset
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_reporting_detail_lines(
  text, text, text, date, date, text[], text[], text[], text[], int, int, uuid
) TO authenticated, anon, service_role;


-- ── 4. Validation queries (run in Supabase SQL Editor) ───────────────────────

/*
-- ── A. Coverage check: how many rows attach to a portal rep / manager? ────────
SELECT
  COUNT(*) FILTER (WHERE portal_rep_id IS NOT NULL) AS matched_to_rep,
  COUNT(*) FILTER (WHERE manager_id    IS NOT NULL) AS matched_to_manager,
  COUNT(*) FILTER (WHERE portal_rep_id IS NULL
                     AND rep_id NOT LIKE '%-%')     AS unmatched_short_ids,
  COUNT(*)                                          AS total_rows
FROM public.v_companywide_reporting_actuals;

-- ── B. Which short rep_ids appear in the view but NOT in sales_reps.acctivate_id?
--    Fix: UPDATE sales_reps SET acctivate_id = '<code>' WHERE name = '<rep name>';
SELECT DISTINCT
  rl.rep_id,
  rl.rep_name,
  COUNT(*) AS line_count
FROM public.v_portal_dealer_rep_reporting_lines rl
WHERE NOT EXISTS (
  SELECT 1 FROM public.sales_reps sr
  WHERE sr.acctivate_id IS NOT NULL
    AND LOWER(TRIM(sr.acctivate_id)) = LOWER(TRIM(rl.rep_id))
)
  AND rl.rep_id NOT LIKE '%-%'   -- exclude raw GUIDs
  AND rl.rep_id != 'Unassigned'
GROUP BY 1, 2
ORDER BY 3 DESC;

-- ── C. Will Grisack reconciliation ───────────────────────────────────────────
-- (Replace manager_name filter with exact name if different)
SELECT
  a.metric_type,
  a.canonical_rep_name,
  a.canonical_rep_key,
  COUNT(*)             AS line_count,
  SUM(a.amount)        AS total_amount
FROM public.v_companywide_reporting_actuals a
WHERE a.manager_name ILIKE '%grisack%'
  AND a.year = 2026
  AND (
    a.metric_type = 'invoiced'
    OR (a.metric_type = 'bookings' AND a.transaction_date >= '2026-08-01')
  )
GROUP BY 1, 2, 3
ORDER BY 1, 2;

-- ── D. Monthly totals for Will Grisack (must equal Live KPI card & table) ────
SELECT
  a.metric_type,
  a.year,
  a.month_number,
  SUM(a.amount)        AS total_amount,
  COUNT(*)             AS line_count
FROM public.v_companywide_reporting_actuals a
WHERE a.manager_name ILIKE '%grisack%'
  AND a.year = 2026
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;
*/
