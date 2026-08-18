-- Comprehensive booking filter fix.
--
-- Root cause (all three surfaces — Live KPI, Dealer Reporting, Rep Reporting):
--
--   v_portal_dealer_rep_reporting_lines bookings branch uses:
--     LEFT JOIN dbo_Orders o ON o."GUIDOrder"::text = f.guid_order::text
--   dbo_Orders."GUIDOrder" is stored in braced GUID format {XXXXXXXX-...} while
--   v_portal_bookings_line_facts.guid_order is plain UUID — the join always
--   returns NULL rows. Consequences:
--     • customer_id = NULL for every booking line → p_customer_ids filter (used
--       for manager/dealer scope in Dealer + Rep Reporting) never matches
--     • rep_id = f.guid_salesperson (raw GUID) instead of Acctivate salesperson
--       code → p_rep_ids filter never matches for bookings
--     • dealer_name = f.dealer_name (may be NULL) instead of o."CustomerID"
--
--   The same GUID mismatch affects the order_salesperson_lookup join:
--     dbo_Orders."GUIDSalesperson"::text = {XXXX-...} (braced)
--     f.guid_salesperson::text            = xxxx-...  (plain UUID)
--   → osl always NULL → salesperson_id / salesperson_name not resolved
--
-- Fix 1: v_portal_dealer_rep_reporting_lines
--   • Strip {} and lowercase both sides of the GUIDOrder join.
--   • Same treatment for GUIDSalesperson in order_salesperson_lookup.
--   • Add customer_lookup CTE (dbo_Orders.GUIDCustomer is native uuid, no
--     brace stripping needed) as fallback for orders not in dbo_Orders.
--     ~2565 booking lines from portal_acctivate_orders have no matching row
--     in dbo_Orders by order GUID; looking up by customer GUID recovers
--     customer_id for those rows.
--   This gives correct customer_id and rep_id for booking lines, enabling
--   all downstream RPC filters to work.
--
-- Fix 2: Remove hard 2026-08-01 booking cutoff from reporting RPCs.
--   The cutoff is enforced on the Live KPI tab via isBookingVisible() in
--   useDealerSalesAggregates. Dealer/Rep Reporting should show booking
--   detail for any date range the user selects — the frontend date-range
--   picker and the KPI card "—" rule handle display-level hiding.
--
-- Fix 3: kpi_monthly_booking_rollup dealer join.
--   • Lowercase both sides to avoid case mismatches.
--   • Add customer_lookup CTE (same as Fix 1) so orders not in dbo_Orders
--     by order GUID can still resolve a dealer via customer GUID fallback.
--
-- Do not change: booking/invoice calculations, totals, 2025 actuals,
--   projections, mat views, or any source table data.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Fix v_portal_dealer_rep_reporting_lines
--    (bookings branch: GUIDOrder join + salesperson lookup join)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_portal_dealer_rep_reporting_lines AS

-- dbo_Orders."GUIDSalesperson" is braced {XXXX-...}; strip {} and lowercase.
WITH order_salesperson_lookup AS (
  SELECT
    TRIM(BOTH '{}' FROM LOWER("GUIDSalesperson"::text))   AS guid_salesperson_norm,
    MAX(NULLIF(TRIM("SalespersonID"::text),   ''))         AS salesperson_id,
    MAX(NULLIF(TRIM("SalespersonName"::text), ''))         AS salesperson_name
  FROM public."dbo_Orders"
  WHERE "GUIDSalesperson" IS NOT NULL
  GROUP BY TRIM(BOTH '{}' FROM LOWER("GUIDSalesperson"::text))
),
-- dbo_Orders."GUIDCustomer" is native uuid type → casts to plain UUID text,
-- same format as portal_acctivate_orders.guid_customer. No brace stripping needed.
-- Used as fallback customer_id for orders not found in dbo_Orders by order GUID.
customer_lookup AS (
  SELECT
    LOWER("GUIDCustomer"::text)                            AS guid_customer_norm,
    MAX(NULLIF(TRIM("CustomerID"::text), ''))               AS customer_id
  FROM public."dbo_Orders"
  WHERE "GUIDCustomer" IS NOT NULL
  GROUP BY LOWER("GUIDCustomer"::text)
),
-- Last-resort fallback: match by dealer name when the name is unique in dealers.
-- Excludes duplicate names to avoid fan-out / double-counting.
unique_dealer_name_lookup AS (
  SELECT
    LOWER(TRIM(name))  AS name_norm,
    MIN(acctivate_id)  AS acctivate_id
  FROM public.dealers
  GROUP BY LOWER(TRIM(name))
  HAVING COUNT(*) = 1
)

SELECT
  'bookings'::text                                                               AS metric_type,
  f.booking_date::date                                                           AS transaction_date,
  EXTRACT(YEAR  FROM f.booking_date)::int                                        AS year,
  EXTRACT(MONTH FROM f.booking_date)::int                                        AS month_number,
  COALESCE(f.dealer_name::text, o."CustomerID"::text, cl.customer_id,
           udl.acctivate_id)                                                     AS dealer_name,
  COALESCE(o."CustomerID"::text, cl.customer_id, udl.acctivate_id)              AS customer_id,
  COALESCE(
    osl.salesperson_name,
    NULLIF(o."SalespersonName"::text, ''),
    NULLIF(o."_Rep1"::text,           ''),
    NULLIF(o."_Rep2"::text,           ''),
    NULLIF(f.rep1::text,              ''),
    NULLIF(f.rep2::text,              ''),
    'Unassigned'
  )::text                                                                        AS rep_name,
  -- rep_id: prefer Acctivate salesperson code; fall back to portal rep1 then raw GUID.
  COALESCE(NULLIF(osl.salesperson_id, ''), NULLIF(f.rep1::text, ''),
           f.guid_salesperson::text)::text                                       AS rep_id,
  f.sku::text                                                                    AS sku,
  f.description::text                                                            AS description,
  f.brand_category::text                                                         AS brand_category,
  f.net_booking_amount::numeric                                                  AS amount,
  NULL::text                                                                     AS invoice_number
FROM public.v_portal_bookings_line_facts f
-- GUIDOrder fix: strip {} and lowercase dbo_Orders side; f.guid_order is plain UUID text.
LEFT JOIN public."dbo_Orders" o
  ON TRIM(BOTH '{}' FROM LOWER(o."GUIDOrder"::text)) = LOWER(f.guid_order)
-- Salesperson lookup fix: strip {} and lowercase both sides.
LEFT JOIN order_salesperson_lookup osl
  ON osl.guid_salesperson_norm = TRIM(BOTH '{}' FROM LOWER(f.guid_salesperson::text))
-- Customer fallback 1: recover customer_id via customer GUID when order GUID misses.
LEFT JOIN customer_lookup cl
  ON cl.guid_customer_norm = LOWER(f.guid_customer)
-- Customer fallback 2: last resort — match by dealer name (unique names only).
LEFT JOIN unique_dealer_name_lookup udl
  ON udl.name_norm = LOWER(TRIM(f.dealer_name))
WHERE f.booking_date IS NOT NULL

UNION ALL

SELECT
  metric_type,
  transaction_date,
  year,
  month_number,
  dealer_name,
  customer_id,
  rep_name,
  rep_id,
  sku,
  description,
  brand_category,
  amount,
  invoice_number
FROM public.get_portal_invoiced_lines();

GRANT SELECT ON public.v_portal_dealer_rep_reporting_lines TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Fix kpi_monthly_booking_rollup (Live KPI bookings)
--    • Keep the braced-GUID fix from migration 000100.
--    • Add LOWER() to dealer join so case mismatches don't drop rows.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.kpi_monthly_booking_rollup(int[], uuid[]);

CREATE FUNCTION public.kpi_monthly_booking_rollup(
  p_years      int[],
  p_dealer_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  year               int,
  month              int,
  bookings           numeric,
  booking_count      int,
  bookings_container numeric,
  bookings_warehouse numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH customer_lookup AS (
    SELECT
      LOWER("GUIDCustomer"::text)                          AS guid_customer_norm,
      MAX(NULLIF(TRIM("CustomerID"::text), ''))             AS customer_id
    FROM public."dbo_Orders"
    WHERE "GUIDCustomer" IS NOT NULL
    GROUP BY LOWER("GUIDCustomer"::text)
  ),
  unique_dealer_name_lookup AS (
    SELECT LOWER(TRIM(name)) AS name_norm, MIN(acctivate_id) AS acctivate_id
    FROM public.dealers
    GROUP BY LOWER(TRIM(name))
    HAVING COUNT(*) = 1
  )
  SELECT
    EXTRACT(YEAR  FROM f.booking_date)::int              AS year,
    EXTRACT(MONTH FROM f.booking_date)::int              AS month,
    COALESCE(SUM(f.net_booking_amount), 0)               AS bookings,
    COUNT(DISTINCT f.guid_order)::int                    AS booking_count,
    COALESCE(SUM(
      CASE WHEN COALESCE(bos.branch_id, o."BranchID") = 'MIXED'
           THEN f.net_booking_amount ELSE 0 END
    ), 0)                                                AS bookings_container,
    COALESCE(SUM(
      CASE WHEN COALESCE(bos.branch_id, o."BranchID") = 'WHSALES'
           THEN f.net_booking_amount ELSE 0 END
    ), 0)                                                AS bookings_warehouse
  FROM public.v_portal_bookings_line_facts f
  LEFT JOIN public."dbo_Orders" o
    ON TRIM(BOTH '{}' FROM LOWER(o."GUIDOrder"::text)) = LOWER(f.guid_order)
  LEFT JOIN customer_lookup cl
    ON cl.guid_customer_norm = LOWER(f.guid_customer)
  LEFT JOIN unique_dealer_name_lookup udl
    ON udl.name_norm = LOWER(TRIM(f.dealer_name))
  LEFT JOIN public.booking_orders_sync bos
    ON bos.guid_order = f.guid_order::uuid
  LEFT JOIN public.dealers dl
    ON LOWER(dl.acctivate_id) = LOWER(COALESCE(o."CustomerID"::text, cl.customer_id, udl.acctivate_id))
  WHERE EXTRACT(YEAR FROM f.booking_date)::int = ANY(p_years)
    AND f.booking_date IS NOT NULL
    AND (p_dealer_ids IS NULL OR dl.id = ANY(p_dealer_ids))
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

GRANT EXECUTE ON FUNCTION public.kpi_monthly_booking_rollup(int[], uuid[])
  TO anon, authenticated, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Remove the hard 2026-08-01 booking cutoff from reporting RPCs.
--
--    The cutoff was added to match the portal BOOKINGS_VISIBLE_FROM rule, but
--    Dealer/Rep Reporting should let users query any date range and see booking
--    line detail. The Live KPI cutoff stays (enforced in useDealerSalesAggregates
--    via isBookingVisible() on the frontend).
-- ─────────────────────────────────────────────────────────────────────────────

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
  p_rep_ids      text[]  DEFAULT NULL
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
        ELSE COALESCE(NULLIF(TRIM(rep_id::text), ''), NULLIF(TRIM(rep_name::text), ''), 'Unassigned')
      END            AS entity_key,
      amount,
      transaction_date
    FROM public.v_portal_dealer_rep_reporting_lines
    WHERE metric_type = p_metric
      AND transaction_date >= LEAST(p_from, COALESCE(p_comp_from, p_from))
      AND transaction_date <= GREATEST(p_to, COALESCE(p_comp_to, p_to))
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
      -- Booking cutoff removed: Dealer/Rep Reporting allows querying any date range.
      -- Live KPI cutoff is enforced client-side via isBookingVisible().
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
  ORDER BY 2 DESC NULLS LAST
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_reporting_grouped_rows(
  text, text, date, date, date, date, text[], text[], text[], text[]
) TO authenticated, anon, service_role;


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
    -- Booking cutoff removed: Dealer/Rep Reporting allows querying any date range.
  ORDER BY transaction_date DESC, invoice_number NULLS LAST
  LIMIT  p_limit
  OFFSET p_offset
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_reporting_detail_lines(
  text, text, text, date, date, text[], text[], text[], text[], int, int
) TO authenticated, anon, service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- Verification — run after applying this migration:
-- ─────────────────────────────────────────────────────────────────────────────
/*
-- 1. Confirm customer_id is now populated for booking lines:
SELECT COUNT(*) AS total, COUNT(customer_id) AS with_customer_id
FROM v_portal_dealer_rep_reporting_lines
WHERE metric_type = 'bookings';
-- Expect: with_customer_id > 0 (was 0 before this fix)

-- 2. Confirm rep_id is now Acctivate salesperson codes, not GUIDs:
SELECT DISTINCT rep_id
FROM v_portal_dealer_rep_reporting_lines
WHERE metric_type = 'bookings'
  AND rep_id IS NOT NULL
LIMIT 20;
-- Expect: short codes like "Brent", "JORDAN", "WILL" rather than GUIDs

-- 3. Check manager-scoped booking totals for a specific manager's dealers:
-- (Replace customer_id values with actual acctivate_ids for that manager's dealers)
SELECT year, month_number, SUM(amount)
FROM v_portal_dealer_rep_reporting_lines
WHERE metric_type = 'bookings'
  AND customer_id IN ('CUST001', 'CUST002')
GROUP BY 1, 2 ORDER BY 1, 2;

-- 4. Check Live KPI bookings via RPC (replace dealer UUIDs):
-- SELECT * FROM kpi_monthly_booking_rollup(ARRAY[2025, 2026], ARRAY['<dealer-uuid>'::uuid]);
*/
