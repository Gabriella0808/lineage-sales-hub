-- ══════════════════════════════════════════════════════════════════════════════
-- Add invoice_type to acctivate_invoice_lines_2026_direct
--
-- Source : dbo.Invoice.Type  (O = Invoice, C = CreditMemo)
-- Andrew includes ALL invoice types.  Credit memos (C) must NOT be filtered.
--
-- This migration also applies Andrew's correct exclude-only category filter
-- to v_portal_invoice_line_facts, replacing the prior include-only whitelist.
--
--   Old (wrong)  : COALESCE(product_sales_category,'NULL') IN ('NULL','SW','ALLOW','FL','FINNLOU','LUX')
--   Correct      : COALESCE(product_sales_category,'')    NOT IN ('FREIGHTO','MISC','SALESTAX','TARIFF')
--
-- The view is updated with CREATE OR REPLACE VIEW (no dependents are dropped)
-- because only new columns are appended and the WHERE clause is corrected.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add column to the staging table
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.acctivate_invoice_lines_2026_direct
  ADD COLUMN IF NOT EXISTS invoice_type text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Recreate v_portal_invoice_line_facts
--    • Appends invoice_type and invoice_type_label (new columns go last so
--      CREATE OR REPLACE VIEW is accepted by PostgreSQL).
--    • Applies Andrew's exclude-only category filter.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_portal_invoice_line_facts AS
SELECT
  d.invoice_date,
  d.invoice_number,
  d.customer_id,
  COALESCE(
    NULLIF(TRIM(dl.name::text), ''),
    d.customer_id
  )                                                       AS dealer_name,
  COALESCE(
    NULLIF(TRIM(asr.name::text),           ''),
    NULLIF(TRIM(pai.sales_rep_name::text), ''),
    NULLIF(TRIM(pai.sales_rep_id::text),   ''),
    NULLIF(TRIM(d.sales_rep_id),           ''),
    'Unassigned'
  )                                                       AS salesperson_name,
  COALESCE(NULLIF(TRIM(d.sales_rep_id), ''), '')         AS salesperson_id,
  d.product_id,
  d.description,
  d.product_sales_category                               AS sales_category,
  CASE d.product_sales_category
    WHEN 'SW'      THEN 'Sea Winds'
    WHEN 'FL'      THEN 'Finn & Lou'
    WHEN 'FINNLOU' THEN 'Finn & Lou'
    WHEN 'LUX'     THEN 'Lux'
    WHEN 'ALLOW'   THEN 'ALLOW'
    ELSE NULL
  END                                                     AS display_category,
  d.product_class::text                                   AS product_class,
  COALESCE(d.price,             0)::numeric               AS price,
  COALESCE(d.qty_invoiced,      0)::numeric               AS qty_invoiced,
  COALESCE(d.line_discount_pct, 0)::numeric               AS line_discount_pct,
  COALESCE(d.formula_net_amount,0)::numeric               AS net_invoice_amount,
  COALESCE(d.invoice_type, '')::text                      AS invoice_type,
  CASE COALESCE(d.invoice_type, '')
    WHEN 'O' THEN 'Invoice'
    WHEN 'C' THEN 'CreditMemo'
    ELSE COALESCE(d.invoice_type, '')
  END                                                     AS invoice_type_label
FROM public.acctivate_invoice_lines_2026_direct d
LEFT JOIN public.dealers dl
  ON dl.acctivate_id = d.customer_id
LEFT JOIN public.portal_acctivate_invoices pai
  ON pai.guid_invoice::text = d.guid_invoice
LEFT JOIN public.acctivate_sales_reps asr
  ON LOWER(TRIM(asr.acctivate_id)) = LOWER(TRIM(d.sales_rep_id))
WHERE d.invoice_date IS NOT NULL
  AND d.invoice_date >= '2026-01-01'
  AND COALESCE(d.product_sales_category, '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF');

GRANT SELECT ON public.v_portal_invoice_line_facts TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Rebuild mv_portal_monthly_invoiced_actuals with the corrected filter
--    Jan–Jul totals come from acctivate_kpi_monthly_invoiced_2026 (locked);
--    only the Aug+ live rows use acctivate_invoice_lines_2026_direct.
-- ─────────────────────────────────────────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS public.mv_portal_monthly_invoiced_actuals;

CREATE MATERIALIZED VIEW public.mv_portal_monthly_invoiced_actuals AS

WITH jan_jul_branch AS (
  SELECT
    d.year,
    d.month_number,
    SUM(CASE
      WHEN d.branch_id = 'MIXED'
       AND COALESCE(d.product_sales_category, '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF')
      THEN COALESCE(d.formula_net_amount, 0)::numeric ELSE 0
    END) AS invoiced_container,
    SUM(CASE
      WHEN d.branch_id = 'WHSALES'
       AND COALESCE(d.product_sales_category, '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF')
      THEN COALESCE(d.formula_net_amount, 0)::numeric ELSE 0
    END) AS invoiced_warehouse,
    SUM(CASE
      WHEN (d.branch_id NOT IN ('MIXED', 'WHSALES') OR d.branch_id IS NULL)
       AND COALESCE(d.product_sales_category, '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF')
      THEN COALESCE(d.formula_net_amount, 0)::numeric ELSE 0
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
      WHEN d.branch_id = 'MIXED'
       AND COALESCE(d.product_sales_category, '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF')
      THEN COALESCE(d.formula_net_amount, 0)::numeric ELSE 0
    END) AS invoiced_container,
    SUM(CASE
      WHEN d.branch_id = 'WHSALES'
       AND COALESCE(d.product_sales_category, '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF')
      THEN COALESCE(d.formula_net_amount, 0)::numeric ELSE 0
    END) AS invoiced_warehouse,
    SUM(CASE
      WHEN (d.branch_id NOT IN ('MIXED', 'WHSALES') OR d.branch_id IS NULL)
       AND COALESCE(d.product_sales_category, '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF')
      THEN COALESCE(d.formula_net_amount, 0)::numeric ELSE 0
    END) AS invoiced_unclassified,
    COUNT(DISTINCT d.invoice_number)::int AS invoice_count
  FROM public.acctivate_invoice_lines_2026_direct d
  WHERE d.invoice_date >= '2026-08-01'
  GROUP BY d.year, d.month_number
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Also apply corrected filter to v_portal_clearance_sales_analytics
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_portal_clearance_sales_analytics AS
SELECT
  d.invoice_date                                                    AS sale_date,
  (d.invoice_date
    + (((5 - EXTRACT(DOW FROM d.invoice_date)::int + 7) % 7))::int
    - 6
  )                                                                 AS week_start,
  (d.invoice_date
    + (((5 - EXTRACT(DOW FROM d.invoice_date)::int + 7) % 7))::int
  )                                                                 AS week_end,
  COALESCE(
    NULLIF(TRIM(asr.name::text),           ''),
    NULLIF(TRIM(pai.sales_rep_name::text), ''),
    NULLIF(TRIM(pai.sales_rep_id::text),   ''),
    NULLIF(TRIM(d.sales_rep_id),           ''),
    'Unassigned'
  )                                                                 AS rep_name,
  COALESCE(NULLIF(TRIM(d.sales_rep_id), ''), '')                   AS rep_id,
  d.product_id                                                      AS sku,
  d.description                                                     AS product,
  COALESCE(disc.product_class, d.product_sales_category)           AS product_class,
  COALESCE(d.qty_invoiced,      0)::numeric                        AS quantity_sold,
  COALESCE(d.formula_net_amount, 0)::numeric                       AS sales_amount,
  d.invoice_number,
  disc.synced_at
FROM public.acctivate_invoice_lines_2026_direct d
INNER JOIN (
  SELECT
    product_id,
    MAX(product_class) AS product_class,
    MAX(synced_at)     AS synced_at
  FROM public.stg_acctivate_discontinued_inventory
  GROUP BY product_id
) disc ON disc.product_id = d.product_id
LEFT JOIN public.portal_acctivate_invoices pai
  ON pai.guid_invoice::text = d.guid_invoice
LEFT JOIN public.acctivate_sales_reps asr
  ON LOWER(TRIM(asr.acctivate_id)) = LOWER(TRIM(d.sales_rep_id))
WHERE d.invoice_date IS NOT NULL
  AND d.invoice_date >= '2026-01-01'
  AND COALESCE(d.product_sales_category, '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF');

GRANT SELECT ON public.v_portal_clearance_sales_analytics
  TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Refresh materialized view and reload PostgREST schema cache
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public.refresh_mv_portal_invoiced();

NOTIFY pgrst, 'reload schema';
