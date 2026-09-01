-- ══════════════════════════════════════════════════════════════════════════════
-- Fix % Container / % Warehouse for both Bookings and Invoiced in Live KPI.
--
-- Root causes:
--   Bookings Aug:  portal_acctivate_orders had no branch_id column. Aug+ orders
--                  are synced by the PS1 script directly into portal_acctivate_orders
--                  (not booking_orders_sync), so the existing join had no branch data.
--   Invoiced Jan–Jun: acctivate_invoice_lines_2026_direct.branch_id is NULL for
--                  rows synced before the column existed. No fallback to
--                  portal_acctivate_invoices (PAI) was in place.
--
-- Classification (unchanged):
--   branch_id = 'MIXED'   → container
--   branch_id = 'WHSALES' → warehouse
--   other / NULL          → unclassified (stays in total; excluded from pct numerator)
--
-- Changes:
--   1. portal_acctivate_orders: ADD COLUMN branch_id text
--   2. mv_portal_monthly_net_bookings_actuals: COALESCE(portal_acctivate_orders.branch_id,
--      booking_orders_sync.branch_id) — covers Aug+ (after sync script update) AND
--      historical pre-Aug rows.
--   3. mv_portal_monthly_invoiced_actuals: COALESCE(d.branch_id, pai.branch_id) in the
--      Jan–Jul arm so months where d.branch_id was not synced fall back to the PAI
--      invoice header (Skyvia has complete Jan–Jul branch data).
--   4. Refresh both MVs WITH DATA so the fix is visible immediately.
--
-- After applying:
--   • Run sync-aug-current-bookings.ps1 (adds BranchID to orders push) to populate
--     portal_acctivate_orders.branch_id for August bookings.
--   • Jan–Jul invoiced percentages will appear immediately (PAI fallback covers them).
--   • Jan–Jul booking percentages already work via booking_orders_sync (unchanged).
--
-- Do NOT change: booking formulas, locked KPI MV (acctivate_kpi_monthly_invoiced_2026),
--               invoiced totals, any dealer/rep reporting, projections, or 2025 actuals.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Add branch_id to portal_acctivate_orders ─────────────────────────────

ALTER TABLE public.portal_acctivate_orders
  ADD COLUMN IF NOT EXISTS branch_id text;

-- ─── 2. Rebuild mv_portal_monthly_net_bookings_actuals ───────────────────────
--
-- Branch priority:
--   portal_acctivate_orders.branch_id (Aug+ after sync script update)
--   → booking_orders_sync.branch_id   (pre-Aug, from Skyvia)

DROP MATERIALIZED VIEW IF EXISTS public.mv_portal_monthly_net_bookings_actuals;

CREATE MATERIALIZED VIEW public.mv_portal_monthly_net_bookings_actuals AS
SELECT
  EXTRACT(YEAR  FROM f.booking_date)::int                                        AS year,
  EXTRACT(MONTH FROM f.booking_date)::int                                        AS month_number,
  COALESCE(SUM(f.net_booking_amount), 0)                                         AS net_bookings_actual,
  COALESCE(SUM(
    CASE WHEN COALESCE(pao.branch_id, bos.branch_id) = 'MIXED'
         THEN f.net_booking_amount ELSE 0 END
  ), 0)                                                                           AS container_bookings_actual,
  COALESCE(SUM(
    CASE WHEN COALESCE(pao.branch_id, bos.branch_id) = 'WHSALES'
         THEN f.net_booking_amount ELSE 0 END
  ), 0)                                                                           AS warehouse_bookings_actual
FROM public.v_portal_bookings_line_facts f
-- Aug+ branch: portal_acctivate_orders.branch_id (populated after sync script update)
LEFT JOIN public.portal_acctivate_orders pao
  ON pao.guid_order = f.guid_order
-- Pre-Aug branch fallback: booking_orders_sync (Skyvia; covers Jan–Jul)
LEFT JOIN public.booking_orders_sync bos
  ON bos.guid_order::text = f.guid_order::text
WHERE f.booking_date IS NOT NULL
GROUP BY 1, 2
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

-- ─── 3. Rebuild mv_portal_monthly_invoiced_actuals ───────────────────────────
--
-- Jan–Jul arm: COALESCE(d.branch_id, pai.branch_id)
--   d.branch_id is NULL for months synced before the column existed (Jan–Jun).
--   pai.branch_id from portal_acctivate_invoices (Skyvia) covers all Jan–Jul invoices.
--
-- Aug+ arm: same COALESCE for consistency; d.branch_id is populated by the direct
--   pull script for August onwards.

DROP MATERIALIZED VIEW IF EXISTS public.mv_portal_monthly_invoiced_actuals;

CREATE MATERIALIZED VIEW public.mv_portal_monthly_invoiced_actuals AS

WITH jan_jul_branch AS (
  SELECT
    d.year,
    d.month_number,
    SUM(CASE
      WHEN COALESCE(d.branch_id, pai.branch_id) = 'MIXED'
       AND COALESCE(d.product_sales_category, '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF')
      THEN COALESCE(d.formula_net_amount, 0)::numeric ELSE 0
    END) AS invoiced_container,
    SUM(CASE
      WHEN COALESCE(d.branch_id, pai.branch_id) = 'WHSALES'
       AND COALESCE(d.product_sales_category, '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF')
      THEN COALESCE(d.formula_net_amount, 0)::numeric ELSE 0
    END) AS invoiced_warehouse,
    SUM(CASE
      WHEN (COALESCE(d.branch_id, pai.branch_id) NOT IN ('MIXED', 'WHSALES')
            OR COALESCE(d.branch_id, pai.branch_id) IS NULL)
       AND COALESCE(d.product_sales_category, '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF')
      THEN COALESCE(d.formula_net_amount, 0)::numeric ELSE 0
    END) AS invoiced_unclassified
  FROM public.acctivate_invoice_lines_2026_direct d
  LEFT JOIN public.portal_acctivate_invoices pai
    ON pai.guid_invoice::text = d.guid_invoice
  WHERE d.invoice_date BETWEEN '2026-01-01' AND '2026-07-31'
  GROUP BY d.year, d.month_number
),

jan_jul_count AS (
  SELECT
    year,
    month_number,
    COUNT(DISTINCT invoice_number)::int AS invoice_count
  FROM public.acctivate_invoice_lines_2026_direct
  WHERE invoice_date BETWEEN '2026-01-01' AND '2026-07-31'
    AND COALESCE(product_sales_category, '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF')
  GROUP BY year, month_number
),

aug_on AS (
  SELECT
    d.year,
    d.month_number,
    SUM(CASE
      WHEN COALESCE(d.product_sales_category, '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF')
      THEN COALESCE(d.formula_net_amount, 0)::numeric ELSE 0
    END) AS invoiced_actual,
    SUM(CASE
      WHEN COALESCE(d.branch_id, pai.branch_id) = 'MIXED'
       AND COALESCE(d.product_sales_category, '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF')
      THEN COALESCE(d.formula_net_amount, 0)::numeric ELSE 0
    END) AS invoiced_container,
    SUM(CASE
      WHEN COALESCE(d.branch_id, pai.branch_id) = 'WHSALES'
       AND COALESCE(d.product_sales_category, '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF')
      THEN COALESCE(d.formula_net_amount, 0)::numeric ELSE 0
    END) AS invoiced_warehouse,
    SUM(CASE
      WHEN (COALESCE(d.branch_id, pai.branch_id) NOT IN ('MIXED', 'WHSALES')
            OR COALESCE(d.branch_id, pai.branch_id) IS NULL)
       AND COALESCE(d.product_sales_category, '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF')
      THEN COALESCE(d.formula_net_amount, 0)::numeric ELSE 0
    END) AS invoiced_unclassified,
    COUNT(DISTINCT d.invoice_number)::int AS invoice_count
  FROM public.acctivate_invoice_lines_2026_direct d
  LEFT JOIN public.portal_acctivate_invoices pai
    ON pai.guid_invoice::text = d.guid_invoice
  WHERE d.invoice_date >= '2026-08-01'
  GROUP BY d.year, d.month_number
)

-- Jan–Jul: locked total from acctivate_kpi_monthly_invoiced_2026; branch from
--           acctivate_invoice_lines_2026_direct COALESCE portal_acctivate_invoices
SELECT
  k.year,
  k.month_number,
  k.invoiced_actual,
  COALESCE(b.invoiced_container,    0)::numeric AS invoiced_container,
  COALESCE(b.invoiced_warehouse,    0)::numeric AS invoiced_warehouse,
  COALESCE(b.invoiced_unclassified, 0)::numeric AS invoiced_unclassified,
  COALESCE(cnt.invoice_count,       0)::int     AS invoice_count
FROM public.acctivate_kpi_monthly_invoiced_2026 k
LEFT JOIN jan_jul_branch b   USING (year, month_number)
LEFT JOIN jan_jul_count  cnt USING (year, month_number)
WHERE k.year = 2026
  AND k.month_number BETWEEN 1 AND 7

UNION ALL

-- Aug+: all from acctivate_invoice_lines_2026_direct (formula_net_amount)
SELECT
  year,
  month_number,
  invoiced_actual,
  invoiced_container,
  invoiced_warehouse,
  invoiced_unclassified,
  invoice_count
FROM aug_on

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

-- ─── 4. Immediately refresh both MVs ─────────────────────────────────────────

SELECT public.refresh_mv_portal_bookings();
SELECT public.refresh_mv_portal_invoiced();

NOTIFY pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION QUERIES — run in Supabase SQL Editor after applying
-- ══════════════════════════════════════════════════════════════════════════════

-- A. Bookings monthly container/warehouse mix (classifier = branch_id)
-- SELECT
--   year,
--   month_number,
--   ROUND(net_bookings_actual, 2)       AS total_bookings,
--   ROUND(container_bookings_actual, 2) AS container_bookings,
--   ROUND(warehouse_bookings_actual, 2) AS warehouse_bookings,
--   ROUND(container_bookings_actual / NULLIF(net_bookings_actual, 0) * 100, 1) AS container_pct,
--   ROUND(warehouse_bookings_actual / NULLIF(net_bookings_actual, 0) * 100, 1) AS warehouse_pct
-- FROM public.mv_portal_monthly_net_bookings_actuals
-- WHERE year = 2026
-- ORDER BY month_number;

-- B. Invoiced monthly container/warehouse mix
-- SELECT
--   year,
--   month_number,
--   ROUND(invoiced_actual, 2)       AS total_invoiced,
--   ROUND(invoiced_container, 2)    AS container_invoiced,
--   ROUND(invoiced_warehouse, 2)    AS warehouse_invoiced,
--   ROUND(invoiced_unclassified, 2) AS unclassified_invoiced,
--   ROUND(invoiced_container / NULLIF(invoiced_actual, 0) * 100, 1) AS container_pct,
--   ROUND(invoiced_warehouse / NULLIF(invoiced_actual, 0) * 100, 1) AS warehouse_pct
-- FROM public.mv_portal_monthly_invoiced_actuals
-- WHERE year = 2026
-- ORDER BY month_number;

-- C. Verify Jan–Jul invoiced branch comes from PAI fallback (rows with NULL d.branch_id)
-- SELECT
--   d.year,
--   d.month_number,
--   COUNT(*)                    AS total_lines,
--   SUM(CASE WHEN d.branch_id IS NOT NULL THEN 1 ELSE 0 END) AS lines_with_direct_branch,
--   SUM(CASE WHEN d.branch_id IS NULL AND pai.branch_id IS NOT NULL THEN 1 ELSE 0 END) AS lines_pai_fallback,
--   SUM(CASE WHEN COALESCE(d.branch_id, pai.branch_id) = 'MIXED'   THEN 1 ELSE 0 END) AS mixed_lines,
--   SUM(CASE WHEN COALESCE(d.branch_id, pai.branch_id) = 'WHSALES' THEN 1 ELSE 0 END) AS whsales_lines
-- FROM public.acctivate_invoice_lines_2026_direct d
-- LEFT JOIN public.portal_acctivate_invoices pai ON pai.guid_invoice::text = d.guid_invoice
-- WHERE d.invoice_date BETWEEN '2026-01-01' AND '2026-07-31'
--   AND COALESCE(d.product_sales_category, '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF')
-- GROUP BY d.year, d.month_number
-- ORDER BY d.year, d.month_number;

-- D. Bookings: confirm branch_id in portal_acctivate_orders (after sync script update)
-- SELECT
--   EXTRACT(MONTH FROM order_date)::int AS month,
--   branch_id,
--   COUNT(*) AS order_count
-- FROM public.portal_acctivate_orders
-- WHERE EXTRACT(YEAR FROM order_date) = 2026
-- GROUP BY 1, 2
-- ORDER BY 1, 2;

-- E. Weighted total % (should NOT be average of monthly percentages):
-- SELECT
--   ROUND(SUM(container_bookings_actual) / NULLIF(SUM(net_bookings_actual), 0) * 100, 1) AS ytd_container_pct,
--   ROUND(SUM(warehouse_bookings_actual) / NULLIF(SUM(net_bookings_actual), 0) * 100, 1) AS ytd_warehouse_pct
-- FROM public.mv_portal_monthly_net_bookings_actuals
-- WHERE year = 2026;
