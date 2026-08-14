-- Fix filter bugs in sales reporting RPCs:
--
--   1. Case-insensitive customer_id comparison (was silently dropping all
--      territory/dealer filter results because scopedCustomerIds is lowercased
--      on the frontend but the SQL compared with = ANY(), which is case-sensitive).
--
--   2. Add p_rep_ids parameter so rep filter is resolved in SQL using canonical
--      Acctivate rep_id matching (lower(rep_id) = ANY(p_rep_ids)) instead of
--      requiring the frontend to resolve dealer customer_ids for the rep — which
--      fails when portal dealer-rep assignments are incomplete.
--
-- No source data modified. Function-layer only.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Aggregated rows — main table + KPI cards
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_sales_reporting_grouped_rows(
  p_metric       text,          -- 'invoiced' | 'bookings'
  p_group_by     text,          -- 'dealer'   | 'rep'
  p_from         date,
  p_to           date,
  p_comp_from    date    DEFAULT NULL,
  p_comp_to      date    DEFAULT NULL,
  p_customer_ids text[]  DEFAULT NULL,  -- NULL = no scope; values must be lowercase
  p_brand_cats   text[]  DEFAULT NULL,
  p_skus         text[]  DEFAULT NULL,
  p_rep_ids      text[]  DEFAULT NULL   -- NULL = no rep filter; values must be lowercase acctivate rep_ids
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
      -- Case-insensitive customer_id match (frontend lowercases before passing).
      AND (p_customer_ids IS NULL
           OR lower(customer_id::text) = ANY(p_customer_ids))
      AND (p_brand_cats IS NULL
           OR array_length(p_brand_cats, 1) IS NULL
           OR COALESCE(
                brand_category,
                CASE WHEN p_metric = 'invoiced' THEN 'Historical Invoice' ELSE '' END
              ) = ANY(p_brand_cats))
      AND (p_skus IS NULL
           OR array_length(p_skus, 1) IS NULL
           OR sku = ANY(p_skus))
      -- Direct canonical rep filter: matches both rep_id ("Brent") and
      -- rep_name ("Brent Holbrook") via lowercased Acctivate acctivate_id.
      AND (p_rep_ids IS NULL
           OR lower(COALESCE(NULLIF(TRIM(rep_id::text), ''), '')) = ANY(p_rep_ids))
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
  text, text, date, date, date, date, text[], text[], text[], text[]
) TO authenticated, anon, service_role;

-- Drop the old 9-param signature (before p_rep_ids was added).
DROP FUNCTION IF EXISTS public.get_sales_reporting_grouped_rows(
  text, text, date, date, date, date, text[], text[], text[]
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Lazy-loaded line detail — drilldown sheet
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_sales_reporting_detail_lines(
  p_metric       text,
  p_group_by     text,        -- 'dealer' | 'rep'
  p_entity_key   text,
  p_from         date,
  p_to           date,
  p_customer_ids text[]  DEFAULT NULL,  -- lowercase
  p_brand_cats   text[]  DEFAULT NULL,
  p_skus         text[]  DEFAULT NULL,
  p_rep_ids      text[]  DEFAULT NULL,  -- lowercase acctivate rep_ids
  p_limit        int     DEFAULT 200,
  p_offset       int     DEFAULT 0
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
    transaction_date,
    invoice_number::text,
    dealer_name::text,
    rep_name::text,
    rep_id::text,
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
      (p_group_by = 'rep'
       AND COALESCE(NULLIF(TRIM(rep_id::text), ''), NULLIF(TRIM(rep_name::text), ''), 'Unassigned') = p_entity_key)
    )
    AND (p_customer_ids IS NULL
         OR lower(customer_id::text) = ANY(p_customer_ids))
    AND (p_brand_cats IS NULL
         OR array_length(p_brand_cats, 1) IS NULL
         OR COALESCE(
              brand_category,
              CASE WHEN p_metric = 'invoiced' THEN 'Historical Invoice' ELSE '' END
            ) = ANY(p_brand_cats))
    AND (p_skus IS NULL
         OR array_length(p_skus, 1) IS NULL
         OR sku = ANY(p_skus))
    AND (p_rep_ids IS NULL
         OR lower(COALESCE(NULLIF(TRIM(rep_id::text), ''), '')) = ANY(p_rep_ids))
    AND (p_metric != 'bookings' OR transaction_date >= '2026-08-01')
  ORDER BY transaction_date DESC, invoice_number NULLS LAST
  LIMIT  p_limit
  OFFSET p_offset
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_reporting_detail_lines(
  text, text, text, date, date, text[], text[], text[], text[], int, int
) TO authenticated, anon, service_role;

-- Revoke the old 9-param signature (added p_rep_ids as the 9th arg, before p_limit/p_offset).
-- The old function had: (text, text, text, date, date, text[], text[], text[], int, int)
-- which is now superseded. DROP IF EXISTS is safe since the new OR REPLACE already covers it
-- when called via the new 11-param signature; this just cleans up the old grant.
DROP FUNCTION IF EXISTS public.get_sales_reporting_detail_lines(
  text, text, text, date, date, text[], text[], text[], int, int
);
