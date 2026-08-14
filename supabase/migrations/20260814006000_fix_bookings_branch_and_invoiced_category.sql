-- Fix 1: mv_portal_monthly_net_bookings_actuals — use booking_orders_sync.branch_id
--   Previous version joined dbo_Orders."GUIDOrder" for BranchID — GUID format mismatch
--   produced zeros. booking_orders_sync already has branch_id (MIXED/WHSALES) and is
--   the same source used by kpi_monthly_booking_rollup (which is known to work).
--   Net booking amounts still come from v_portal_bookings_line_facts (correct formula).
--
-- Fix 2: mv_portal_monthly_invoiced_actuals — filter Jan–Jul container/warehouse
--   to product sales categories only (SW, FINNLOU, LUX, ALLOW).
--   Previous version included freight lines in the classification sum; June had a
--   small WHSALES freight amount that caused 0.0% / 0.0% display instead of "-".
--
-- Classification (both metrics):
--   branch_id = 'MIXED'   → container
--   branch_id = 'WHSALES' → warehouse
--   other / NULL          → unclassified
--
-- Display rule (frontend): show "-" when container + warehouse = 0.
-- Do not change totals, dealer/rep reporting, projections, or 2025 actuals.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Bookings mat view
-- ─────────────────────────────────────────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS public.mv_portal_monthly_net_bookings_actuals;

CREATE MATERIALIZED VIEW public.mv_portal_monthly_net_bookings_actuals AS
SELECT
  EXTRACT(YEAR  FROM f.booking_date)::int                                   AS year,
  EXTRACT(MONTH FROM f.booking_date)::int                                   AS month_number,
  COALESCE(SUM(f.net_booking_amount), 0)                                    AS net_bookings_actual,
  -- Use booking_orders_sync.branch_id — same source as kpi_monthly_booking_rollup RPC.
  -- The dbo_Orders join (previous approach) produced zeros due to GUID format mismatch.
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

CREATE OR REPLACE FUNCTION public.refresh_mv_portal_bookings()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_portal_monthly_net_bookings_actuals;
$$;

GRANT SELECT ON public.mv_portal_monthly_net_bookings_actuals TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_mv_portal_bookings() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Invoiced mat view (with product-sales-category filter for Jan–Jul branch)
-- ─────────────────────────────────────────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS public.mv_portal_monthly_invoiced_actuals;

CREATE MATERIALIZED VIEW public.mv_portal_monthly_invoiced_actuals AS

WITH jan_jul_branch AS (
  SELECT
    d.year,
    d.month_number,
    -- Only count classified amounts for product sales lines (not freight/misc).
    -- Freight lines in June had branch_id = 'WHSALES' but are not product sales,
    -- causing a misleading 0.0%/0.0% display. Excluding them shows "-" correctly.
    SUM(CASE
      WHEN d.branch_id = 'MIXED'
       AND d.product_sales_category IN ('SW', 'FINNLOU', 'LUX', 'ALLOW')
      THEN COALESCE(d.invoice_detail_amount, 0)::numeric
      ELSE 0
    END) AS invoiced_container,
    SUM(CASE
      WHEN d.branch_id = 'WHSALES'
       AND d.product_sales_category IN ('SW', 'FINNLOU', 'LUX', 'ALLOW')
      THEN COALESCE(d.invoice_detail_amount, 0)::numeric
      ELSE 0
    END) AS invoiced_warehouse,
    SUM(CASE
      WHEN (d.branch_id NOT IN ('MIXED', 'WHSALES') OR d.branch_id IS NULL)
       AND d.product_sales_category IN ('SW', 'FINNLOU', 'LUX', 'ALLOW')
      THEN COALESCE(d.invoice_detail_amount, 0)::numeric
      ELSE 0
    END) AS invoiced_unclassified
  FROM public.acctivate_invoice_lines_2026_direct d
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
  GROUP BY year, month_number
)

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

SELECT
  EXTRACT(YEAR  FROM f.invoice_date)::int         AS year,
  EXTRACT(MONTH FROM f.invoice_date)::int         AS month_number,
  COALESCE(SUM(f.net_invoice_amount), 0)::numeric AS invoiced_actual,
  COALESCE(SUM(CASE
    WHEN pai.branch_id = 'MIXED'
    THEN f.net_invoice_amount ELSE 0
  END), 0)::numeric                               AS invoiced_container,
  COALESCE(SUM(CASE
    WHEN pai.branch_id = 'WHSALES'
    THEN f.net_invoice_amount ELSE 0
  END), 0)::numeric                               AS invoiced_warehouse,
  COALESCE(SUM(CASE
    WHEN pai.branch_id NOT IN ('MIXED', 'WHSALES') OR pai.branch_id IS NULL
    THEN f.net_invoice_amount ELSE 0
  END), 0)::numeric                               AS invoiced_unclassified,
  COUNT(DISTINCT f.invoice_number)::int           AS invoice_count
FROM public.v_portal_invoice_line_facts f
LEFT JOIN public.portal_acctivate_invoices pai
  ON pai.invoice_number = f.invoice_number
WHERE f.invoice_date >= '2026-08-01'
GROUP BY 1, 2

ORDER BY 1, 2
WITH DATA;

CREATE UNIQUE INDEX ON public.mv_portal_monthly_invoiced_actuals (year, month_number);

GRANT SELECT ON public.mv_portal_monthly_invoiced_actuals
  TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification — run after applying this migration:
-- ─────────────────────────────────────────────────────────────────────────────
/*
-- Bookings split by month:
SELECT
  year, month_number,
  ROUND(net_bookings_actual)       AS bookings_total,
  ROUND(container_bookings_actual) AS bookings_container,
  ROUND(warehouse_bookings_actual) AS bookings_warehouse,
  ROUND((container_bookings_actual / NULLIF(net_bookings_actual,0))*100,1) AS container_pct,
  ROUND((warehouse_bookings_actual / NULLIF(net_bookings_actual,0))*100,1) AS warehouse_pct
FROM public.mv_portal_monthly_net_bookings_actuals
WHERE year = 2026
ORDER BY month_number;

-- Invoiced split by month:
SELECT
  year, month_number,
  ROUND(invoiced_actual)       AS invoiced_total,
  ROUND(invoiced_container)    AS invoiced_container,
  ROUND(invoiced_warehouse)    AS invoiced_warehouse,
  ROUND(invoiced_unclassified) AS invoiced_unclassified,
  ROUND((invoiced_container / NULLIF(invoiced_actual,0))*100,1) AS container_pct,
  ROUND((invoiced_warehouse / NULLIF(invoiced_actual,0))*100,1) AS warehouse_pct
FROM public.mv_portal_monthly_invoiced_actuals
WHERE year = 2026
ORDER BY month_number;
*/
