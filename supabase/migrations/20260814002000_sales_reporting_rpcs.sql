-- Performance: server-side aggregation RPCs for Sales Reporting.
-- Eliminates the 23k-row, 24-page client-side fetch that occurs on every
-- YTD load.  No source data modified — all changes are function-layer only.
--
-- Creates two SECURITY DEFINER functions that read from
-- v_portal_dealer_rep_reporting_lines (already granted to anon/authenticated):
--
--   get_sales_reporting_grouped_rows  — one row per entity (dealer or rep)
--     with primary and comparative period totals.  Used by the main table
--     and KPI cards when Display = Total.
--
--   get_sales_reporting_detail_lines  — paginated raw lines for a single
--     entity.  Used by the drilldown sheet when Display = Total.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.  Aggregated rows — main table + KPI cards
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_sales_reporting_grouped_rows(
  p_metric       text,          -- 'invoiced' | 'bookings'
  p_group_by     text,          -- 'dealer'   | 'rep'
  p_from         date,
  p_to           date,
  p_comp_from    date    DEFAULT NULL,
  p_comp_to      date    DEFAULT NULL,
  p_customer_ids text[]  DEFAULT NULL,  -- NULL = no scope filter
  p_brand_cats   text[]  DEFAULT NULL,  -- NULL/empty = all brands
  p_skus         text[]  DEFAULT NULL   -- NULL/empty = all SKUs
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
        THEN COALESCE(NULLIF(TRIM(dealer_name::text), ''), customer_id::text, 'Unknown')
        -- For rep: group by rep_id (Acctivate canonical key) so that rows where
        -- rep_name differs ("Brent" vs "Brent Holbrook") still merge into one group.
        -- The frontend maps rep_id → full canonical name via repAcIdToCanonical.
        ELSE COALESCE(NULLIF(TRIM(rep_id::text), ''), NULLIF(TRIM(rep_name::text), ''), 'Unassigned')
      END            AS entity_key,
      amount,
      transaction_date
    FROM public.v_portal_dealer_rep_reporting_lines
    WHERE metric_type = p_metric
      -- Single scan covers both periods; FILTER below splits them.
      AND transaction_date >= LEAST(p_from, COALESCE(p_comp_from, p_from))
      AND transaction_date <= GREATEST(p_to, COALESCE(p_comp_to, p_to))
      AND (p_customer_ids IS NULL
           OR customer_id::text = ANY(p_customer_ids))
      AND (p_brand_cats IS NULL
           OR array_length(p_brand_cats, 1) IS NULL
           OR COALESCE(
                brand_category,
                CASE WHEN p_metric = 'invoiced' THEN 'Historical Invoice' ELSE '' END
              ) = ANY(p_brand_cats))
      AND (p_skus IS NULL
           OR array_length(p_skus, 1) IS NULL
           OR sku = ANY(p_skus))
      -- Bookings are only valid from 2026-08-01 (matches BOOKINGS_VISIBLE_FROM).
      AND (p_metric != 'bookings' OR transaction_date >= '2026-08-01')
  )
  SELECT
    entity_key,
    COALESCE(SUM(amount) FILTER (
      WHERE transaction_date BETWEEN p_from AND p_to
    ), 0)::numeric                              AS primary_amt,
    COALESCE(COUNT(*) FILTER (
      WHERE transaction_date BETWEEN p_from AND p_to
    ), 0)::bigint                               AS primary_lines,
    COALESCE(SUM(amount) FILTER (
      WHERE p_comp_from IS NOT NULL
        AND transaction_date BETWEEN p_comp_from AND p_comp_to
    ), 0)::numeric                              AS comp_amt,
    COALESCE(COUNT(*) FILTER (
      WHERE p_comp_from IS NOT NULL
        AND transaction_date BETWEEN p_comp_from AND p_comp_to
    ), 0)::bigint                               AS comp_lines
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
  ORDER BY primary_amt DESC NULLS LAST
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_reporting_grouped_rows(
  text, text, date, date, date, date, text[], text[], text[]
) TO authenticated, anon, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2.  Lazy-loaded line detail — drilldown sheet
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_sales_reporting_detail_lines(
  p_metric       text,
  p_group_by     text,        -- 'dealer' | 'rep'
  p_entity_key   text,
  p_from         date,
  p_to           date,
  p_customer_ids text[]  DEFAULT NULL,
  p_brand_cats   text[]  DEFAULT NULL,
  p_skus         text[]  DEFAULT NULL,
  p_limit        int     DEFAULT 200,
  p_offset       int     DEFAULT 0
)
RETURNS TABLE (
  transaction_date date,
  invoice_number   text,
  dealer_name      text,
  rep_name         text,
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
    transaction_date,
    invoice_number::text,
    dealer_name::text,
    rep_name::text,
    customer_id::text,
    sku::text,
    description::text,
    brand_category::text,
    amount::numeric
  FROM public.v_portal_dealer_rep_reporting_lines
  WHERE metric_type = p_metric
    AND transaction_date BETWEEN p_from AND p_to
    AND (
      (p_group_by = 'dealer'
       AND COALESCE(NULLIF(TRIM(dealer_name::text), ''), customer_id::text, 'Unknown') = p_entity_key)
      OR
      -- p_entity_key is the rep_id (canonical Acctivate key), matching grouped-rows RPC.
      (p_group_by = 'rep'
       AND COALESCE(NULLIF(TRIM(rep_id::text), ''), NULLIF(TRIM(rep_name::text), ''), 'Unassigned') = p_entity_key)
    )
    AND (p_customer_ids IS NULL
         OR customer_id::text = ANY(p_customer_ids))
    AND (p_brand_cats IS NULL
         OR array_length(p_brand_cats, 1) IS NULL
         OR COALESCE(
              brand_category,
              CASE WHEN p_metric = 'invoiced' THEN 'Historical Invoice' ELSE '' END
            ) = ANY(p_brand_cats))
    AND (p_skus IS NULL
         OR array_length(p_skus, 1) IS NULL
         OR sku = ANY(p_skus))
    AND (p_metric != 'bookings' OR transaction_date >= '2026-08-01')
  ORDER BY transaction_date DESC, invoice_number NULLS LAST
  LIMIT  p_limit
  OFFSET p_offset
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_reporting_detail_lines(
  text, text, text, date, date, text[], text[], text[], int, int
) TO authenticated, anon, service_role;
