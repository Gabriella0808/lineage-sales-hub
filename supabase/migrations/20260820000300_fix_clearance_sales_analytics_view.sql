-- Rebuild v_portal_clearance_sales_analytics
--
-- Source of truth for discontinued SKUs: stg_acctivate_discontinued_inventory.product_id
-- (populated by the VM PowerShell sync; replaces old Skyvia / ProductClass filter)
-- Sales data: v_portal_invoice_line_facts
--   qty_invoiced     → quantity_sold
--   net_invoice_amount (= formula_net_amount) → sales_amount
--
-- Week logic (Saturday–Friday):
--   week_end   = nearest Friday on or after sale_date
--   week_start = week_end - 6 days
--   Example: Aug 15 (Sat) – Aug 21 (Fri), 2026
--   PostgreSQL DOW: 0=Sun, 1=Mon, …, 5=Fri, 6=Sat
--   days_to_friday = (5 - DOW + 7) % 7
--   For Sat (6): (5-6+7)%7 = 6 → +6 = next Friday ✓
--   For Fri (5): (5-5+7)%7 = 0 → stays on Friday    ✓
--
-- Consumers:
--   ClearanceAnalyticsPage.tsx  — selects sale_date, rep_name, sku, product, quantity_sold, sales_amount
--   notify-weekly-clearance     — selects sku, product, product_class, quantity_sold, sales_amount, rep_name
--
-- ── Validation queries (run after applying) ───────────────────────────────────
--
--   -- Current-week rows (Aug 15–21 example):
--   SELECT sale_date, rep_name, sku, product, quantity_sold, sales_amount
--   FROM public.v_portal_clearance_sales_analytics
--   WHERE sale_date >= '2026-08-15' AND sale_date < '2026-08-22'
--   ORDER BY sale_date DESC, rep_name, sku;
--
--   -- Weekly summary (must return non-zero):
--   SELECT rep_name,
--          COUNT(DISTINCT sku) AS skus,
--          SUM(quantity_sold)  AS total_units,
--          ROUND(SUM(sales_amount), 0) AS gross_revenue
--   FROM public.v_portal_clearance_sales_analytics
--   WHERE sale_date >= '2026-08-15' AND sale_date < '2026-08-22'
--   GROUP BY rep_name
--   ORDER BY gross_revenue DESC;
--
--   -- Full date range:
--   SELECT COUNT(*), MIN(sale_date), MAX(sale_date)
--   FROM public.v_portal_clearance_sales_analytics;
--
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop and recreate so column additions (week_start, week_end) don't hit
-- CREATE OR REPLACE type-compatibility restrictions on the old view.
-- This view has no SQL-level dependents (only app-layer consumers).
DROP VIEW IF EXISTS public.v_portal_clearance_sales_analytics CASCADE;

CREATE VIEW public.v_portal_clearance_sales_analytics
WITH (security_invoker = true) AS
SELECT
  f.invoice_date                                                    AS sale_date,
  -- Saturday–Friday week boundaries
  (f.invoice_date
    + (((5 - EXTRACT(DOW FROM f.invoice_date)::int + 7) % 7))::int
    - 6
  )                                                                 AS week_start,
  (f.invoice_date
    + (((5 - EXTRACT(DOW FROM f.invoice_date)::int + 7) % 7))::int
  )                                                                 AS week_end,
  f.salesperson_name                                                AS rep_name,
  f.salesperson_id                                                  AS rep_id,
  f.product_id                                                      AS sku,
  f.description                                                     AS product,
  COALESCE(d.product_class, f.sales_category)                      AS product_class,
  f.qty_invoiced                                                    AS quantity_sold,
  f.net_invoice_amount                                              AS sales_amount,
  f.invoice_number,
  d.synced_at
FROM public.v_portal_invoice_line_facts f
INNER JOIN (
  -- One row per product_id: avoids fan-out when a SKU is stocked in multiple warehouses.
  SELECT
    product_id,
    MAX(product_class) AS product_class,
    MAX(synced_at)     AS synced_at
  FROM public.stg_acctivate_discontinued_inventory
  GROUP BY product_id
) d ON d.product_id = f.product_id;

GRANT SELECT ON public.v_portal_clearance_sales_analytics
  TO authenticated, anon, service_role;

-- Notify PostgREST to reload schema cache
SELECT pg_notify('pgrst', 'reload schema');
