-- ══════════════════════════════════════════════════════════════════════════════
-- Switch mv_portal_monthly_invoiced_actuals from the locked-KPI-hybrid approach
-- to a pure line-level pull so Live KPI 26 Act matches Dealer/Rep Reporting.
--
-- Previous state (since 20260824000300_fix_invoice_include_finnlou.sql):
--   Jan–Jul invoiced_actual → acctivate_kpi_monthly_invoiced_2026 (locked table)
--   Aug+    invoiced_actual → acctivate_invoice_lines_2026_direct  (direct pull)
--
-- Root cause: the locked KPI table used raw dtl.Amount with no category filter.
--   Its Jan–Jul total (5,645,350.46) is ~371 K above the formula total
--   (5,274,171.38). The locked table is therefore methodologically inconsistent
--   with August (which has always used formula_net_amount).
--
-- New approach: ALL months read from acctivate_invoice_lines_2026_direct using
--   formula_net_amount with Andrew's exclude filter:
--     COALESCE(product_sales_category,'') NOT IN ('FREIGHTO','MISC','SALESTAX','TARIFF')
--
-- This is identical to the methodology already used by:
--   - v_portal_invoice_line_facts (the Dealer/Rep view layer)
--   - v_portal_dealer_rep_reporting_lines → v_companywide_reporting_actuals
--   - August invoiced MTD and monthly totals (which already match Andrew)
--
-- After this migration the Live KPI 26 Act monthly totals will agree exactly with
-- Dealer/Rep Reporting for the same date range.
--
-- Expected Jan–Aug 2026 corrected invoiced total: 6,201,132.68
--
-- Does NOT touch:
--   - acctivate_kpi_monthly_invoiced_2026 (still exists as audit reference)
--   - August rows in acctivate_invoice_lines_2026_direct (source=aug_direct_pull)
--   - bookings views or mat views
--   - get_portal_invoiced_lines() or v_portal_invoice_line_facts
--   - v_portal_dealer_rep_reporting_lines or v_companywide_reporting_actuals
--   - rep_targets, projections, or 2025 actuals
-- ══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Rebuild mv_portal_monthly_invoiced_actuals
--
--    All months: formula_net_amount from acctivate_invoice_lines_2026_direct
--    Filter   : exclude FREIGHTO, MISC, SALESTAX, TARIFF (Andrew's Power Query)
--    Branch   : MIXED=container, WHSALES=warehouse, else=unclassified
-- ─────────────────────────────────────────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS public.mv_portal_monthly_invoiced_actuals;

CREATE MATERIALIZED VIEW public.mv_portal_monthly_invoiced_actuals AS
SELECT
  EXTRACT(YEAR  FROM d.invoice_date)::int                       AS year,
  EXTRACT(MONTH FROM d.invoice_date)::int                       AS month_number,
  COALESCE(SUM(COALESCE(d.formula_net_amount, 0)::numeric), 0)  AS invoiced_actual,
  COALESCE(SUM(
    CASE WHEN UPPER(COALESCE(d.branch_id, '')) = 'MIXED'
    THEN COALESCE(d.formula_net_amount, 0)::numeric ELSE 0 END
  ), 0)                                                          AS invoiced_container,
  COALESCE(SUM(
    CASE WHEN UPPER(COALESCE(d.branch_id, '')) = 'WHSALES'
    THEN COALESCE(d.formula_net_amount, 0)::numeric ELSE 0 END
  ), 0)                                                          AS invoiced_warehouse,
  COALESCE(SUM(
    CASE WHEN UPPER(COALESCE(d.branch_id, '')) NOT IN ('MIXED', 'WHSALES')
    THEN COALESCE(d.formula_net_amount, 0)::numeric ELSE 0 END
  ), 0)                                                          AS invoiced_unclassified,
  COUNT(DISTINCT d.invoice_number)::int                          AS invoice_count
FROM public.acctivate_invoice_lines_2026_direct d
WHERE d.invoice_date IS NOT NULL
  AND d.invoice_date >= '2026-01-01'
  AND COALESCE(d.product_sales_category, '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF')
GROUP BY
  EXTRACT(YEAR  FROM d.invoice_date),
  EXTRACT(MONTH FROM d.invoice_date)
ORDER BY 1, 2
WITH DATA;

-- Unique index required by REFRESH MATERIALIZED VIEW CONCURRENTLY
-- (called by refresh_mv_portal_invoiced() after each sync run)
CREATE UNIQUE INDEX ON public.mv_portal_monthly_invoiced_actuals (year, month_number);

GRANT SELECT ON public.mv_portal_monthly_invoiced_actuals
  TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Verify the new totals match the expected corrected figures
--    (informational — does not affect the migration)
--
-- Expected after running this migration:
--   SELECT year, month_number, ROUND(invoiced_actual,2) AS invoiced_actual
--   FROM public.mv_portal_monthly_invoiced_actuals
--   WHERE year = 2026 ORDER BY month_number;
--
--   month | invoiced_actual
--   ------+----------------
--   1     |  840,274.29
--   2     |  847,181.85
--   3     |  710,093.58
--   4     |  619,664.22
--   5     |  739,076.22
--   6     |  724,636.37
--   7     |  793,244.85
--   8     |  926,961.30
--   Jan–Aug total: 6,201,132.68
-- ─────────────────────────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
