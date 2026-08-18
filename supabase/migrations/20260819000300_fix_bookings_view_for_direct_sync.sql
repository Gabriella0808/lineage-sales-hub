-- After the direct VM bookings sync (Aug 2026+), portal_acctivate_orders and
-- portal_acctivate_order_lines contain August rows but v_portal_bookings_line_facts
-- returns zero rows for those dates.
--
-- Root cause: v_portal_bookings_line_facts was created directly in Supabase
-- (not via migrations) and has a filter or join that blocks the direct-sync rows.
-- We replace it with a clean definition that reads from the confirmed source tables
-- and has no artificial date cutoff.
--
-- Changes:
--   1. Replace v_portal_bookings_line_facts — reads portal_acctivate_orders ⋈
--      portal_acctivate_order_lines on guid_order. Approved booking formula.
--      Excludes line_cancelled = true only. No other filters.
--   2. Recreate v_portal_dealer_rep_reporting_lines (same logic as 20260817000200).
--   3. Recreate v_companywide_reporting_actuals (same logic as 20260818000300).
--   4. Recreate mv_portal_monthly_net_bookings_actuals WITH DATA (same logic as
--      20260814006000). Built from scratch so August rows are immediately included.
--   5. Recreate refresh_mv_portal_bookings().
--
-- kpi_monthly_booking_rollup and the sales-reporting RPCs reference these objects
-- by name and do not need to be recreated.
--
-- Do not change: booking formula, brand_category mapping, invoiced pipeline,
-- projections, 2025 actuals, or any source table data.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drop dependency chain (deepest first to avoid FK/view errors)
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW     IF EXISTS public.v_companywide_reporting_actuals;
DROP VIEW     IF EXISTS public.v_portal_dealer_rep_reporting_lines;
DROP MATERIALIZED VIEW IF EXISTS public.mv_portal_monthly_net_bookings_actuals;
DROP VIEW     IF EXISTS public.v_portal_bookings_line_facts;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. v_portal_bookings_line_facts
--
--    Source of truth for every booking calculation in the portal.
--
--    Covers ALL dates — pre-Aug Skyvia rows and Aug+ direct-sync rows live in
--    the same tables so no UNION is needed.
--
--    booking_date: portal_acctivate_orders.order_date (timestamp) cast to date.
--
--    net_booking_amount formula (matches v_portal_bookings_line_facts prior to
--    this migration and the formula in the direct-sync PS1 script):
--      if original_price is populated and non-zero:
--        qty_ordered * original_price * (1 - line_discount_pct / 100)
--      else:
--        amount - tariff_amount - freight_amount
--    All amount columns are text in the schema; cast to numeric here.
--
--    brand_category mapping:
--      SW      → Sea Winds
--      FINNLOU → Finn & Lou
--      LUX     → Lux
--      ALLOW   → MISC
--      other   → pass through sales_category
--
--    Filter: exclude line_cancelled = true. No order_status filter.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE VIEW public.v_portal_bookings_line_facts AS
SELECT
  o.guid_order::text                                            AS guid_order,
  o.guid_customer::text                                         AS guid_customer,
  o.guid_salesperson::text                                      AS guid_salesperson,
  o.order_date::date                                            AS booking_date,
  o.sold_to_name::text                                          AS dealer_name,
  o.rep1::text                                                  AS rep1,
  o.rep2::text                                                  AS rep2,
  ol.product_id::text                                           AS sku,
  ol.description::text                                          AS description,
  CASE ol.sales_category
    WHEN 'SW'      THEN 'Sea Winds'
    WHEN 'FINNLOU' THEN 'Finn & Lou'
    WHEN 'LUX'     THEN 'Lux'
    WHEN 'ALLOW'   THEN 'MISC'
    ELSE ol.sales_category
  END::text                                                     AS brand_category,
  CASE
    WHEN NULLIF(TRIM(COALESCE(ol.original_price, '')), '') IS NOT NULL
      AND ol.original_price::numeric != 0
    THEN
        COALESCE(ol.qty_ordered::numeric,      0)
      * ol.original_price::numeric
      * (1.0 - COALESCE(ol.line_discount_pct::numeric, 0) / 100.0)
    ELSE
        COALESCE(ol.amount::numeric,           0)
      - COALESCE(ol.tariff_amount::numeric,    0)
      - COALESCE(ol.freight_amount::numeric,   0)
  END::numeric                                                  AS net_booking_amount
FROM public.portal_acctivate_orders o
JOIN public.portal_acctivate_order_lines ol
  ON ol.guid_order = o.guid_order
WHERE NOT COALESCE(ol.line_cancelled, false);

GRANT SELECT ON public.v_portal_bookings_line_facts TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. v_portal_dealer_rep_reporting_lines
--    Unchanged from migration 20260817000200_fix_booking_guid_joins_and_reporting_cutoff.
--    Recreated here because v_portal_bookings_line_facts was dropped above.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE VIEW public.v_portal_dealer_rep_reporting_lines AS

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
-- dbo_Orders."GUIDCustomer" is native uuid; no brace stripping.
-- Fallback customer_id for orders not matched via order GUID.
customer_lookup AS (
  SELECT
    LOWER("GUIDCustomer"::text)                            AS guid_customer_norm,
    MAX(NULLIF(TRIM("CustomerID"::text), ''))               AS customer_id
  FROM public."dbo_Orders"
  WHERE "GUIDCustomer" IS NOT NULL
  GROUP BY LOWER("GUIDCustomer"::text)
),
-- Last-resort dealer name → acctivate_id match (unique names only).
unique_dealer_name_lookup AS (
  SELECT
    LOWER(TRIM(name))  AS name_norm,
    MIN(acctivate_id)  AS acctivate_id
  FROM public.dealers
  GROUP BY LOWER(TRIM(name))
  HAVING COUNT(*) = 1
)

-- ── Bookings branch ──────────────────────────────────────────────────────────
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
  COALESCE(NULLIF(osl.salesperson_id, ''), NULLIF(f.rep1::text, ''),
           f.guid_salesperson::text)::text                                       AS rep_id,
  f.sku::text                                                                    AS sku,
  f.description::text                                                            AS description,
  f.brand_category::text                                                         AS brand_category,
  f.net_booking_amount::numeric                                                  AS amount,
  NULL::text                                                                     AS invoice_number
FROM public.v_portal_bookings_line_facts f
-- GUIDOrder: strip {} and lowercase dbo_Orders side; f.guid_order is plain text.
LEFT JOIN public."dbo_Orders" o
  ON TRIM(BOTH '{}' FROM LOWER(o."GUIDOrder"::text)) = LOWER(f.guid_order)
LEFT JOIN order_salesperson_lookup osl
  ON osl.guid_salesperson_norm = TRIM(BOTH '{}' FROM LOWER(f.guid_salesperson::text))
LEFT JOIN customer_lookup cl
  ON cl.guid_customer_norm = LOWER(f.guid_customer)
LEFT JOIN unique_dealer_name_lookup udl
  ON udl.name_norm = LOWER(TRIM(f.dealer_name))
WHERE f.booking_date IS NOT NULL

UNION ALL

-- ── Invoiced branch ──────────────────────────────────────────────────────────
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
-- 4. v_companywide_reporting_actuals
--    Unchanged from migration 20260818000300_fix_invoice_category_and_amount.
--    Recreated because v_portal_dealer_rep_reporting_lines was dropped above.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE VIEW public.v_companywide_reporting_actuals AS
WITH real_reps AS (
  SELECT
    sr.id           AS portal_rep_id,
    sr.name         AS canonical_rep_name,
    sr.acctivate_id AS canonical_rep_key,
    sr.manager_id
  FROM public.sales_reps sr
  WHERE
    NULLIF(TRIM(sr.acctivate_id), '') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.territories t
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
  rr.portal_rep_id,
  rr.canonical_rep_name,
  rr.canonical_rep_key,
  rr.manager_id,
  m.name AS manager_name
FROM public.v_portal_dealer_rep_reporting_lines rl
LEFT JOIN real_reps rr
  ON  NULLIF(TRIM(rl.rep_id), '') IS NOT NULL
  AND LOWER(TRIM(rr.canonical_rep_key)) = LOWER(TRIM(rl.rep_id))
LEFT JOIN public.managers m ON m.id = rr.manager_id;

GRANT SELECT ON public.v_companywide_reporting_actuals TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. mv_portal_monthly_net_bookings_actuals
--    Rebuilt WITH DATA so August totals appear immediately.
--    Logic unchanged from migration 20260814006000_fix_bookings_branch_and_invoiced_category.
--    booking_orders_sync LEFT JOIN provides branch_id for pre-Aug orders.
--    Aug+ direct-sync orders have no row in booking_orders_sync → branch amounts
--    are 0 for now (acceptable until booking_orders_sync is extended).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW public.mv_portal_monthly_net_bookings_actuals AS
SELECT
  EXTRACT(YEAR  FROM f.booking_date)::int                                   AS year,
  EXTRACT(MONTH FROM f.booking_date)::int                                   AS month_number,
  COALESCE(SUM(f.net_booking_amount), 0)                                    AS net_bookings_actual,
  COALESCE(SUM(
    CASE WHEN bos.branch_id = 'MIXED'   THEN f.net_booking_amount ELSE 0 END
  ), 0)                                                                      AS container_bookings_actual,
  COALESCE(SUM(
    CASE WHEN bos.branch_id = 'WHSALES' THEN f.net_booking_amount ELSE 0 END
  ), 0)                                                                      AS warehouse_bookings_actual
FROM public.v_portal_bookings_line_facts f
LEFT JOIN public.booking_orders_sync bos
  ON bos.guid_order::text = f.guid_order::text
WHERE f.booking_date IS NOT NULL
GROUP BY 1, 2
ORDER BY 1, 2
WITH DATA;

CREATE UNIQUE INDEX ON public.mv_portal_monthly_net_bookings_actuals (year, month_number);

GRANT SELECT ON public.mv_portal_monthly_net_bookings_actuals
  TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. refresh_mv_portal_bookings
--    Recreated because the mat view above was dropped and rebuilt.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.refresh_mv_portal_bookings()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_portal_monthly_net_bookings_actuals;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_mv_portal_bookings() TO service_role;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Validation (run after applying in Supabase SQL Editor)
-- ─────────────────────────────────────────────────────────────────────────────
/*
-- Must return rows for 2026-08-18:
SELECT
  booking_date,
  brand_category,
  COUNT(*)                          AS line_count,
  ROUND(SUM(net_booking_amount), 0) AS total
FROM public.v_portal_bookings_line_facts
WHERE booking_date = '2026-08-18'
GROUP BY booking_date, brand_category
ORDER BY brand_category;

-- Confirm August appears in the mat view:
SELECT year, month_number, ROUND(net_bookings_actual) AS bookings
FROM public.mv_portal_monthly_net_bookings_actuals
WHERE year = 2026
ORDER BY month_number;

-- Confirm dealer/rep reporting sees August:
SELECT transaction_date, COUNT(*) AS lines, ROUND(SUM(amount)) AS total
FROM public.v_portal_dealer_rep_reporting_lines
WHERE metric_type = 'bookings'
  AND transaction_date = '2026-08-18'
GROUP BY transaction_date;
*/
