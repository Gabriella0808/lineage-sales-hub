-- Add real container/warehouse splits to mv_portal_monthly_invoiced_actuals.
--
-- Previous state: both columns were hardcoded 0::numeric.
--
-- New state:
--   Jan–Jul 2026 : branch from acctivate_invoice_lines_2026_direct
--                  → dbo_Invoice."GUIDInvoice" → dbo_Orders."GUIDOrder" → BranchID
--   Aug 2026+    : branch from portal_acctivate_invoices.guid_invoice
--                  → dbo_Invoice."GUIDInvoice" → dbo_Orders."GUIDOrder" → BranchID
--
-- Classification identical to kpi_monthly_invoice_rollup (20260708000300):
--   COALESCE(i."BranchID", o."BranchID") = 'MIXED'   → container
--   COALESCE(i."BranchID", o."BranchID") = 'WHSALES' → warehouse
--
-- The invoiced_actual totals (Jan–Jul from acctivate_kpi_monthly_invoiced_2026,
-- Aug+ from v_portal_invoice_line_facts) are unchanged.

DROP MATERIALIZED VIEW IF EXISTS public.mv_portal_monthly_invoiced_actuals;

CREATE MATERIALIZED VIEW public.mv_portal_monthly_invoiced_actuals AS

-- ── Jan–Jul 2026 ─────────────────────────────────────────────────────────────
-- Total from pre-verified acctivate_kpi_monthly_invoiced_2026 (unchanged).
-- Container/warehouse from line data → dbo_Invoice → dbo_Orders BranchID.

WITH jan_jul_branch AS (
  SELECT
    d.year,
    d.month_number,
    SUM(CASE
      WHEN COALESCE(i."BranchID", o."BranchID") = 'MIXED'
      THEN COALESCE(d.invoice_detail_amount, 0)::numeric
      ELSE 0
    END) AS invoiced_container,
    SUM(CASE
      WHEN COALESCE(i."BranchID", o."BranchID") = 'WHSALES'
      THEN COALESCE(d.invoice_detail_amount, 0)::numeric
      ELSE 0
    END) AS invoiced_warehouse
  FROM public.acctivate_invoice_lines_2026_direct d
  LEFT JOIN public."dbo_Invoice" i
    ON i."GUIDInvoice"::text = d.guid_invoice
  LEFT JOIN public."dbo_Orders" o
    ON o."GUIDOrder" = i."GUIDOrder"
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
),

-- ── Aug 2026+ ─────────────────────────────────────────────────────────────────
-- BranchID lookup: portal_acctivate_invoices → dbo_Invoice → dbo_Orders.
-- Joined to v_portal_invoice_line_facts on invoice_number.

aug_branch AS (
  SELECT
    pai.invoice_number,
    COALESCE(i."BranchID", o."BranchID") AS branch_id
  FROM public.portal_acctivate_invoices pai
  LEFT JOIN public."dbo_Invoice" i
    ON i."GUIDInvoice"::text = pai.guid_invoice::text
  LEFT JOIN public."dbo_Orders" o
    ON o."GUIDOrder" = i."GUIDOrder"
  WHERE pai.invoice_date IS NOT NULL
    AND pai.invoice_date::date >= '2026-08-01'
)

SELECT
  k.year,
  k.month_number,
  k.invoiced_actual,
  COALESCE(b.invoiced_container, 0)::numeric AS invoiced_container,
  COALESCE(b.invoiced_warehouse, 0)::numeric AS invoiced_warehouse,
  COALESCE(cnt.invoice_count, 0)::int        AS invoice_count
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
    WHEN b.branch_id = 'MIXED'   THEN f.net_invoice_amount ELSE 0
  END), 0)::numeric                               AS invoiced_container,
  COALESCE(SUM(CASE
    WHEN b.branch_id = 'WHSALES' THEN f.net_invoice_amount ELSE 0
  END), 0)::numeric                               AS invoiced_warehouse,
  COUNT(DISTINCT f.invoice_number)::int           AS invoice_count
FROM public.v_portal_invoice_line_facts f
LEFT JOIN aug_branch b ON b.invoice_number = f.invoice_number
WHERE f.invoice_date >= '2026-08-01'
GROUP BY 1, 2

ORDER BY 1, 2
WITH DATA;

CREATE UNIQUE INDEX ON public.mv_portal_monthly_invoiced_actuals (year, month_number);

GRANT SELECT ON public.mv_portal_monthly_invoiced_actuals
  TO authenticated, anon, service_role;
