-- Fix invoiced_container / invoiced_warehouse in mv_portal_monthly_invoiced_actuals.
--
-- Previous migration (004000) joined through dbo_Invoice.GUIDInvoice →
-- dbo_Orders.GUIDOrder — GUID formats did not match, all zeros.
--
-- SSMS diagnostic confirmed: Invoice.BranchID, Orders.BranchID, and all
-- other classification fields are NULL for Jan–June 2026 invoices.
-- July 2026 has MIXED (container) and WHSALES (warehouse) values.
--
-- Correct approach:
--   Jan–Jul 2026 : acctivate_invoice_lines_2026_direct.branch_id (direct column)
--   Aug 2026+    : portal_acctivate_invoices.branch_id joined on invoice_number
--
-- Classification:
--   branch_id = 'MIXED'   → invoiced_container
--   branch_id = 'WHSALES' → invoiced_warehouse
--   branch_id = 'DIRECT'  → invoiced_unclassified (not yet confirmed)
--   branch_id IS NULL     → invoiced_unclassified
--
-- Display rule (enforced on frontend):
--   invoiced_container + invoiced_warehouse = 0 → show "-" for both columns
--   Otherwise show real percentages.
--
-- invoiced_actual totals are unchanged.

DROP MATERIALIZED VIEW IF EXISTS public.mv_portal_monthly_invoiced_actuals;

CREATE MATERIALIZED VIEW public.mv_portal_monthly_invoiced_actuals AS

-- ── Jan–Jul 2026 ─────────────────────────────────────────────────────────────
-- branch_id is a direct column on acctivate_invoice_lines_2026_direct — no join.

WITH jan_jul_branch AS (
  SELECT
    d.year,
    d.month_number,
    SUM(CASE
      WHEN d.branch_id = 'MIXED'
      THEN COALESCE(d.invoice_detail_amount, 0)::numeric
      ELSE 0
    END) AS invoiced_container,
    SUM(CASE
      WHEN d.branch_id = 'WHSALES'
      THEN COALESCE(d.invoice_detail_amount, 0)::numeric
      ELSE 0
    END) AS invoiced_warehouse,
    SUM(CASE
      WHEN d.branch_id NOT IN ('MIXED', 'WHSALES') OR d.branch_id IS NULL
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
  COALESCE(b.invoiced_container,     0)::numeric AS invoiced_container,
  COALESCE(b.invoiced_warehouse,     0)::numeric AS invoiced_warehouse,
  COALESCE(b.invoiced_unclassified,  0)::numeric AS invoiced_unclassified,
  COALESCE(cnt.invoice_count,        0)::int     AS invoice_count
FROM public.acctivate_kpi_monthly_invoiced_2026 k
LEFT JOIN jan_jul_branch b   USING (year, month_number)
LEFT JOIN jan_jul_count  cnt USING (year, month_number)
WHERE k.year = 2026
  AND k.month_number BETWEEN 1 AND 7

UNION ALL

-- ── Aug 2026+ ─────────────────────────────────────────────────────────────────
-- branch_id from portal_acctivate_invoices joined on invoice_number.

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
