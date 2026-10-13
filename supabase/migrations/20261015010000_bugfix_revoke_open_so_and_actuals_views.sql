-- Bug sweep follow-up to 20261015000000 — close the gap at the source.
--
-- Every known direct consumer of these three views (src/hooks/
-- usePreSale.ts, src/components/LiveKpiReport.tsx, src/components/
-- ExecutiveOverview.tsx, src/components/TargetProgressChart.tsx,
-- src/hooks/useOpenSalesOrders.ts, src/hooks/useInventoryHub.ts) has been
-- repointed to the scoped RPCs added in 20261015000000.sql, verified by
-- repo-wide grep (no remaining `.from("v_portal_open_sales_order_line_
-- facts"|"v_companywide_reporting_actuals"|"v_daily_invoiced_actuals")`
-- calls anywhere in src/), and tsc/vite build both pass clean. Safe to
-- revoke direct SELECT now.

BEGIN;

REVOKE SELECT ON public.v_portal_open_sales_order_line_facts FROM anon, authenticated;
REVOKE SELECT ON public.v_companywide_reporting_actuals FROM anon, authenticated;
REVOKE SELECT ON public.v_daily_invoiced_actuals FROM anon, authenticated;

COMMIT;
