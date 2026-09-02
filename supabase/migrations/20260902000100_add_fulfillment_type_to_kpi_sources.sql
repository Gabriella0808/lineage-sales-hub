-- ══════════════════════════════════════════════════════════════════════════════
-- Add fulfillment_type classification to booking and invoice KPI sources.
--
-- Classification mapping (confirmed by Andrew/Justin — SINGLE PLACE to update):
--
--   branch_id = 'MIXED'   → 'container'
--   branch_id = 'DIRECT'  → 'container'   (confirmed: DIRECT ships container)
--   branch_id = 'WHSALES' → 'warehouse'
--   blank / NULL / other  → 'unclassified'
--
-- Jan–Jun 2026 invoices: both Invoice.BranchID and linked Order.BranchID are blank
-- in Acctivate at source (confirmed via SSMS). These months stay 'unclassified'.
--
-- Branch source priority:
--   Bookings : COALESCE(portal_acctivate_orders.branch_id,  booking_orders_sync.branch_id)
--              Aug+ orders populate pao.branch_id via sync script.
--              Jan–Jul orders have branch_id in bos (Skyvia).
--   Invoiced : COALESCE(acctivate_invoice_lines_2026_direct.branch_id,
--                        portal_acctivate_orders.branch_id  ← via order_number join,
--                        booking_orders_sync.branch_id       ← via pao.guid_order)
--              Jan–Jun 2026: invoice.branch_id may be NULL in Acctivate itself.
--              Order fallback may supply branch for those months.
--
-- Changes:
--   1. portal_acctivate_orders: ADD COLUMN branch_id (IF NOT EXISTS).
--   2. v_invoice_lines_2026_classified: NEW VIEW wrapping invoice direct table
--      with three-tier branch fallback and fulfillment_type derivation.
--   3. v_portal_bookings_line_facts: CREATE OR REPLACE — adds branch_id (COALESCE)
--      and fulfillment_type (with DIRECT handling) at end.
--   4. mv_portal_monthly_net_bookings_actuals: rebuilt using v_portal_bookings_line_facts
--      fulfillment_type (container / warehouse; rest = unclassified).
--   5. mv_portal_monthly_invoiced_actuals: rebuilt using v_invoice_lines_2026_classified
--      fulfillment_type (same logic).
--   6. Refresh functions redeclared (CREATE OR REPLACE, idempotent).
--
-- Display rule (enforced in frontend):
--   actuals = 0           → "-"
--   actuals > 0, cont = 0 → "0.0%"  (month genuinely unclassified)
--   actuals > 0, cont > 0 → real percentage
--   Unclassified % = (total − container − warehouse) / total
--
-- Does NOT change: booking totals, invoice totals, formulas, dealer/rep reporting,
-- projections, discount_code, Labor Day Promo, 2025 actuals, or any data values.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── 1. portal_acctivate_orders: ensure branch_id column exists ──────────────

ALTER TABLE public.portal_acctivate_orders
  ADD COLUMN IF NOT EXISTS branch_id text;

-- ─── 2. v_invoice_lines_2026_classified ──────────────────────────────────────
--
-- Three-tier branch fallback for invoice lines:
--   Tier 1: acctivate_invoice_lines_2026_direct.branch_id   (invoice's own branch)
--   Tier 2: portal_acctivate_orders.branch_id               (order branch via order_number)
--   Tier 3: booking_orders_sync.branch_id                   (Skyvia order branch via guid_order)
--
-- *** BRANCH MAP (confirmed) ***
-- 'MIXED'   → 'container'
-- 'DIRECT'  → 'container'   (confirmed by Andrew/Justin)
-- 'WHSALES' → 'warehouse'
-- other     → 'unclassified'

CREATE OR REPLACE VIEW public.v_invoice_lines_2026_classified AS
SELECT
  d.invoice_date,
  d.invoice_number,
  d.order_number,
  d.customer_id,
  d.product_sales_category,
  d.formula_net_amount,
  -- Raw invoice branch (may be NULL for Jan–Jun)
  d.branch_id                                                                    AS invoice_branch_id,
  -- Resolved branch: invoice first, then order (pao), then Skyvia order (bos)
  COALESCE(
    NULLIF(TRIM(COALESCE(d.branch_id,   '')), ''),
    NULLIF(TRIM(COALESCE(pao.branch_id, '')), ''),
    NULLIF(TRIM(COALESCE(bos.branch_id, '')), '')
  )                                                                               AS resolved_branch_id,
  -- *** BRANCH MAP (confirmed: MIXED + DIRECT = container, WHSALES = warehouse) ***
  CASE UPPER(COALESCE(
    NULLIF(TRIM(COALESCE(d.branch_id,   '')), ''),
    NULLIF(TRIM(COALESCE(pao.branch_id, '')), ''),
    NULLIF(TRIM(COALESCE(bos.branch_id, '')), ''),
    ''
  ))
    WHEN 'MIXED'   THEN 'container'
    WHEN 'WHSALES' THEN 'warehouse'
    WHEN 'DIRECT'  THEN 'container'
    ELSE                'unclassified'
  END                                                                             AS fulfillment_type
FROM public.acctivate_invoice_lines_2026_direct d
-- Tier 2: order branch via order_number
LEFT JOIN public.portal_acctivate_orders pao
  ON pao.order_number = d.order_number
 AND d.order_number IS NOT NULL
-- Tier 3: Skyvia order branch via pao.guid_order → bos.guid_order
LEFT JOIN public.booking_orders_sync bos
  ON bos.guid_order::text = pao.guid_order
 AND pao.guid_order IS NOT NULL;

GRANT SELECT ON public.v_invoice_lines_2026_classified TO anon, authenticated;

-- ─── 3. v_portal_bookings_line_facts: add branch_id + fulfillment_type ───────
--
-- CREATE OR REPLACE: adds columns at end only — existing columns unchanged.
-- Dependents (v_portal_dealer_rep_reporting_lines, etc.) unaffected.
--
-- *** BRANCH MAP (confirmed: MIXED + DIRECT = container, WHSALES = warehouse) ***

CREATE OR REPLACE VIEW public.v_portal_bookings_line_facts AS
SELECT
  o.guid_order::text                                                    AS guid_order,
  o.guid_customer::text                                                 AS guid_customer,
  o.guid_salesperson::text                                              AS guid_salesperson,
  date(o.order_date)                                                    AS booking_date,
  o.sold_to_name::text                                                  AS dealer_name,
  NULLIF(TRIM(o.customer_id::text), '')                                 AS customer_id,
  o.rep1::text                                                          AS rep1,
  o.rep2::text                                                          AS rep2,
  l.product_id::text                                                    AS sku,
  l.description::text                                                   AS description,
  CASE l.sales_category
    WHEN 'SW'      THEN 'Sea Winds'
    WHEN 'FINNLOU' THEN 'Finn & Lou'
    WHEN 'LUX'     THEN 'Lux'
    WHEN 'ALLOW'   THEN 'MISC'
    ELSE l.sales_category
  END::text                                                             AS brand_category,
  CASE
    WHEN COALESCE(NULLIF(l.original_price, '')::numeric, 0) <> 0
    THEN
        COALESCE(l.qty_ordered::numeric,      0)
      * NULLIF(l.original_price, '')::numeric
      * (1.0 - COALESCE(l.line_discount_pct::numeric, 0) / 100.0)
    ELSE
        COALESCE(l.amount::numeric,           0)
      - COALESCE(l.tariff_amount::numeric,    0)
      - COALESCE(l.freight_amount::numeric,   0)
  END::numeric                                                          AS net_booking_amount,
  l.product_class::text                                                 AS product_class,
  l.discount_code::text                                                 AS discount_code,
  -- Branch: pao.branch_id (Aug+ after sync script) → bos.branch_id (Jan–Jul Skyvia)
  COALESCE(
    NULLIF(TRIM(COALESCE(o.branch_id,   '')), ''),
    NULLIF(TRIM(COALESCE(bos.branch_id, '')), '')
  )::text                                                               AS branch_id,
  -- *** BRANCH MAP (confirmed: MIXED + DIRECT = container, WHSALES = warehouse) ***
  CASE UPPER(COALESCE(
    NULLIF(TRIM(COALESCE(o.branch_id,   '')), ''),
    NULLIF(TRIM(COALESCE(bos.branch_id, '')), ''),
    ''
  ))
    WHEN 'MIXED'   THEN 'container'
    WHEN 'WHSALES' THEN 'warehouse'
    WHEN 'DIRECT'  THEN 'container'
    ELSE                'unclassified'
  END::text                                                             AS fulfillment_type
FROM public.portal_acctivate_orders o
JOIN public.portal_acctivate_order_lines l
  ON l.guid_order = o.guid_order
-- Skyvia branch fallback for Jan–Jul (booking_orders_sync has no order_number,
-- join by guid_order which matches pao.guid_order text format).
LEFT JOIN public.booking_orders_sync bos
  ON bos.guid_order::text = o.guid_order
WHERE COALESCE(l.line_cancelled, false) = false
  AND l.sales_category IN ('SW', 'FINNLOU', 'LUX', 'HOSP', 'ALLOW', 'MISC');

GRANT SELECT ON public.v_portal_bookings_line_facts TO anon, authenticated;

-- ─── 4. Rebuild mv_portal_monthly_net_bookings_actuals ───────────────────────
--
-- Reads fulfillment_type from v_portal_bookings_line_facts.
-- 'container' and 'warehouse' are the only classified buckets.
-- Everything else (including 'pending_business_confirmation', 'unclassified')
-- is captured as total − container − warehouse in the frontend.

DROP MATERIALIZED VIEW IF EXISTS public.mv_portal_monthly_net_bookings_actuals;

CREATE MATERIALIZED VIEW public.mv_portal_monthly_net_bookings_actuals AS
SELECT
  EXTRACT(YEAR  FROM f.booking_date)::int                                       AS year,
  EXTRACT(MONTH FROM f.booking_date)::int                                       AS month_number,
  COALESCE(SUM(f.net_booking_amount), 0)                                        AS net_bookings_actual,
  COALESCE(SUM(
    CASE WHEN f.fulfillment_type = 'container' THEN f.net_booking_amount ELSE 0 END
  ), 0)                                                                          AS container_bookings_actual,
  COALESCE(SUM(
    CASE WHEN f.fulfillment_type = 'warehouse' THEN f.net_booking_amount ELSE 0 END
  ), 0)                                                                          AS warehouse_bookings_actual
FROM public.v_portal_bookings_line_facts f
WHERE f.booking_date IS NOT NULL
GROUP BY
  EXTRACT(YEAR  FROM f.booking_date),
  EXTRACT(MONTH FROM f.booking_date)
ORDER BY 1, 2
WITH DATA;

CREATE UNIQUE INDEX ON public.mv_portal_monthly_net_bookings_actuals (year, month_number);

GRANT SELECT ON public.mv_portal_monthly_net_bookings_actuals
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.refresh_mv_portal_bookings()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_portal_monthly_net_bookings_actuals;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_mv_portal_bookings() TO service_role;

-- ─── 5. Rebuild mv_portal_monthly_invoiced_actuals ───────────────────────────
--
-- Reads from v_invoice_lines_2026_classified (includes order branch fallback).
-- Same formula_net_amount + category exclusion as prior state (20260827000500).
-- invoiced_actual total is unchanged.

DROP MATERIALIZED VIEW IF EXISTS public.mv_portal_monthly_invoiced_actuals;

CREATE MATERIALIZED VIEW public.mv_portal_monthly_invoiced_actuals AS
SELECT
  EXTRACT(YEAR  FROM v.invoice_date)::int                        AS year,
  EXTRACT(MONTH FROM v.invoice_date)::int                        AS month_number,
  COALESCE(SUM(COALESCE(v.formula_net_amount, 0)::numeric), 0)   AS invoiced_actual,
  COALESCE(SUM(
    CASE WHEN v.fulfillment_type = 'container'
    THEN COALESCE(v.formula_net_amount, 0)::numeric ELSE 0 END
  ), 0)                                                           AS invoiced_container,
  COALESCE(SUM(
    CASE WHEN v.fulfillment_type = 'warehouse'
    THEN COALESCE(v.formula_net_amount, 0)::numeric ELSE 0 END
  ), 0)                                                           AS invoiced_warehouse,
  COALESCE(SUM(
    CASE WHEN v.fulfillment_type NOT IN ('container', 'warehouse')
    THEN COALESCE(v.formula_net_amount, 0)::numeric ELSE 0 END
  ), 0)                                                           AS invoiced_unclassified,
  COUNT(DISTINCT v.invoice_number)::int                           AS invoice_count
FROM public.v_invoice_lines_2026_classified v
WHERE v.invoice_date IS NOT NULL
  AND v.invoice_date >= '2026-01-01'
  AND COALESCE(v.product_sales_category, '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF')
GROUP BY
  EXTRACT(YEAR  FROM v.invoice_date),
  EXTRACT(MONTH FROM v.invoice_date)
ORDER BY 1, 2
WITH DATA;

CREATE UNIQUE INDEX ON public.mv_portal_monthly_invoiced_actuals (year, month_number);

GRANT SELECT ON public.mv_portal_monthly_invoiced_actuals
  TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.refresh_mv_portal_invoiced()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_portal_monthly_invoiced_actuals;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_mv_portal_invoiced() TO service_role;

-- ─── 6. Refresh both MVs immediately ─────────────────────────────────────────

SELECT public.refresh_mv_portal_bookings();
SELECT public.refresh_mv_portal_invoiced();

NOTIFY pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════════════════
-- SUPABASE VALIDATION QUERIES — run in SQL Editor after applying
-- ══════════════════════════════════════════════════════════════════════════════

-- A. Invoice branch distribution (shows invoice_branch_id, resolved_branch_id, fulfillment_type):
-- SELECT
--   EXTRACT(MONTH FROM invoice_date)::int                          AS month,
--   COALESCE(NULLIF(TRIM(invoice_branch_id),  ''), 'NULL/BLANK')  AS raw_invoice_branch,
--   COALESCE(resolved_branch_id, 'NULL/BLANK')                    AS resolved_branch,
--   fulfillment_type,
--   COUNT(*)                                                       AS lines,
--   ROUND(SUM(formula_net_amount), 2)                             AS total_amount
-- FROM public.v_invoice_lines_2026_classified
-- WHERE EXTRACT(YEAR FROM invoice_date) = 2026
--   AND COALESCE(product_sales_category, '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF')
-- GROUP BY 1, 2, 3, 4
-- ORDER BY 1, 2;

-- B. Booking branch distribution:
-- SELECT
--   EXTRACT(MONTH FROM booking_date)::int  AS month,
--   COALESCE(branch_id, 'NULL/BLANK')     AS branch_id,
--   fulfillment_type,
--   COUNT(*)                              AS lines,
--   ROUND(SUM(net_booking_amount), 2)     AS total_bookings
-- FROM public.v_portal_bookings_line_facts
-- WHERE EXTRACT(YEAR FROM booking_date) = 2026
-- GROUP BY 1, 2, 3
-- ORDER BY 1, 2;

-- C. MV monthly container / warehouse / unclassified split — BOOKINGS:
-- SELECT
--   year, month_number,
--   ROUND(net_bookings_actual, 2)                                                           AS total_b,
--   ROUND(container_bookings_actual, 2)                                                     AS cont_b,
--   ROUND(warehouse_bookings_actual, 2)                                                     AS wh_b,
--   ROUND(net_bookings_actual - container_bookings_actual - warehouse_bookings_actual, 2)   AS unclass_b,
--   ROUND(container_bookings_actual / NULLIF(net_bookings_actual,0) * 100, 1)              AS cont_pct,
--   ROUND(warehouse_bookings_actual / NULLIF(net_bookings_actual,0) * 100, 1)              AS wh_pct,
--   ROUND((net_bookings_actual - container_bookings_actual - warehouse_bookings_actual)
--         / NULLIF(net_bookings_actual,0) * 100, 1)                                        AS unclass_pct
-- FROM public.mv_portal_monthly_net_bookings_actuals
-- WHERE year = 2026 ORDER BY month_number;

-- D. MV monthly container / warehouse / unclassified split — INVOICED:
-- SELECT
--   year, month_number,
--   ROUND(invoiced_actual, 2)      AS total_i,
--   ROUND(invoiced_container, 2)   AS cont_i,
--   ROUND(invoiced_warehouse, 2)   AS wh_i,
--   ROUND(invoiced_unclassified, 2) AS unclass_i,
--   ROUND(invoiced_container   / NULLIF(invoiced_actual,0) * 100, 1) AS cont_pct,
--   ROUND(invoiced_warehouse   / NULLIF(invoiced_actual,0) * 100, 1) AS wh_pct,
--   ROUND(invoiced_unclassified / NULLIF(invoiced_actual,0) * 100, 1) AS unclass_pct
-- FROM public.mv_portal_monthly_invoiced_actuals
-- WHERE year = 2026 ORDER BY month_number;

-- E. Weighted YTD TOTAL row (matches Live KPI TOTAL row):
-- SELECT
--   ROUND(SUM(container_bookings_actual) / NULLIF(SUM(net_bookings_actual),0) * 100, 1) AS ytd_cont_b_pct,
--   ROUND(SUM(warehouse_bookings_actual) / NULLIF(SUM(net_bookings_actual),0) * 100, 1) AS ytd_wh_b_pct,
--   ROUND((SUM(net_bookings_actual) - SUM(container_bookings_actual) - SUM(warehouse_bookings_actual))
--         / NULLIF(SUM(net_bookings_actual),0) * 100, 1)                                 AS ytd_unclass_b_pct
-- FROM public.mv_portal_monthly_net_bookings_actuals WHERE year = 2026;
--
-- SELECT
--   ROUND(SUM(invoiced_container)    / NULLIF(SUM(invoiced_actual),0) * 100, 1) AS ytd_cont_i_pct,
--   ROUND(SUM(invoiced_warehouse)    / NULLIF(SUM(invoiced_actual),0) * 100, 1) AS ytd_wh_i_pct,
--   ROUND(SUM(invoiced_unclassified) / NULLIF(SUM(invoiced_actual),0) * 100, 1) AS ytd_unclass_i_pct
-- FROM public.mv_portal_monthly_invoiced_actuals WHERE year = 2026;

-- ══════════════════════════════════════════════════════════════════════════════
-- ACCTIVATE SSMS DIAGNOSTIC QUERIES
-- Run against Acctivate SQL Server to verify source branch_id before backfill.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Invoice.BranchID by month — shows what Acctivate actually has:
-- SELECT
--   FORMAT(i.InvoiceDate, 'yyyy-MM')                           AS invoice_month,
--   ISNULL(NULLIF(RTRIM(i.BranchID), ''), 'NULL/BLANK')        AS branch_id,
--   COUNT(DISTINCT i.InvoiceNumber)                            AS invoice_count,
--   SUM(dtl.Amount)                                            AS total_amount
-- FROM dbo.Invoice i
-- JOIN dbo.InvoiceDetail dtl ON dtl.GUIDInvoice = i.GUIDInvoice
-- WHERE YEAR(i.InvoiceDate) = 2026
-- GROUP BY FORMAT(i.InvoiceDate, 'yyyy-MM'), ISNULL(NULLIF(RTRIM(i.BranchID), ''), 'NULL/BLANK')
-- ORDER BY 1, 2;

-- 2. Order.BranchID by month — for comparison and fallback assessment:
-- SELECT
--   FORMAT(o.OrderDate, 'yyyy-MM')                             AS order_month,
--   ISNULL(NULLIF(RTRIM(o.BranchID), ''), 'NULL/BLANK')        AS branch_id,
--   COUNT(*)                                                   AS order_count,
--   SUM(o.SubTotal)                                            AS total_subtotal
-- FROM dbo.[Order] o
-- WHERE YEAR(o.OrderDate) = 2026
-- GROUP BY FORMAT(o.OrderDate, 'yyyy-MM'), ISNULL(NULLIF(RTRIM(o.BranchID), ''), 'NULL/BLANK')
-- ORDER BY 1, 2;

-- 3. Backfill feasibility — for invoices with blank BranchID, what does the linked Order have?
-- SELECT
--   FORMAT(i.InvoiceDate, 'yyyy-MM')                           AS invoice_month,
--   ISNULL(NULLIF(RTRIM(i.BranchID), ''), 'NULL')             AS inv_branch,
--   ISNULL(NULLIF(RTRIM(o.BranchID), ''), 'NULL')             AS order_branch,
--   COUNT(DISTINCT i.InvoiceNumber)                            AS invoices,
--   SUM(dtl.Amount)                                            AS total_amount
-- FROM dbo.Invoice i
-- JOIN dbo.InvoiceDetail dtl ON dtl.GUIDInvoice = i.GUIDInvoice
-- LEFT JOIN dbo.[Order] o ON o.OrderNumber = i.OrderNumber
-- WHERE YEAR(i.InvoiceDate) = 2026
--   AND (i.BranchID IS NULL OR RTRIM(i.BranchID) = '')
-- GROUP BY
--   FORMAT(i.InvoiceDate, 'yyyy-MM'),
--   ISNULL(NULLIF(RTRIM(i.BranchID), ''), 'NULL'),
--   ISNULL(NULLIF(RTRIM(o.BranchID), ''), 'NULL')
-- ORDER BY 1, 3 DESC;
-- Expected: if order_branch shows MIXED/WHSALES/DIRECT for Jan–Jun invoices,
-- the backfill is possible. If order_branch is also NULL, those rows are
-- genuinely unclassifiable and will remain 'unclassified' in the portal.
