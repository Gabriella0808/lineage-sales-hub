-- Apply invoice category whitelist using portal_acctivate_invoices source.
--
-- Root causes fixed in this migration:
--   1. dbo_Invoice is empty — all prior invoice functions that joined dbo_Invoice
--      returned 0 rows. The correct source is portal_acctivate_invoices +
--      portal_acctivate_invoice_lines (162 K rows, current data).
--   2. No product_class filter was applied — non-product charges (shipping,
--      import, taxes, QC fees, etc.) inflated the total from $190,301 to $226K.
--
-- Whitelist (portal_acctivate_invoice_lines.product_class):
--   Finn & Louise:  CABBED, CHATMAPL, CHATMIDN, MHVDARK, MHVLIGHT, PTBREEZE, RIOVISTA
--   Sea Winds:      CABBED, CMAYDRIF, CREDENZA, ISLAMORA, MIRAMAR, MONBLANC,
--                   MONBLEU, OCEANISL, PICKET, SURFSIDE
--   Lux Lighting:   LUXCOAST, LUXTRANS, LUXTRAD
--   MISC bucket:    ECOMMALL
--
-- Excluded product_class codes (non-product charges):
--   SHIP, IMPORT, MISC, CLOSEOUT, CCFEE, TAX-FL, TAX-NJ,
--   QCFREIGH, QCFACTOR, RETURN, MAUI, (blank)
--
-- ── Apply in Supabase SQL Editor ──────────────────────────────────────────────
--   Paste and run the entire file. The final statement refreshes the MV.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── Step 1: Replace is_portal_invoice_category() ─────────────────────────────
-- Now operates on portal_acctivate_invoice_lines.product_class (exact codes).

CREATE OR REPLACE FUNCTION public.is_portal_invoice_category(product_class text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT UPPER(TRIM(product_class)) = ANY(ARRAY[
    -- Finn & Louise collections
    'CABBED',   -- Cabinet Beds (shared with Sea Winds)
    'CHATMAPL', -- Chatham Maple
    'CHATMIDN', -- Chatham Midnight
    'MHVDARK',  -- Manhattan Valley Dark
    'MHVLIGHT', -- Manhattan Valley Light
    'PTBREEZE', -- Point Breeze
    'RIOVISTA', -- Rio Vista
    -- Sea Winds collections
    'CMAYDRIF', -- Cape May
    'CREDENZA', -- Credenza
    'ISLAMORA', -- Islamorada
    'MIRAMAR',  -- Miramar
    'MONBLANC', -- Monaco Blanc
    'MONBLEU',  -- Monaco Bleu
    'OCEANISL', -- Ocean Isles
    'PICKET',   -- Picket Fence
    'SURFSIDE', -- Surfside
    -- Lux Lighting collections
    'LUXCOAST', -- Coastal
    'LUXTRANS', -- Transitional
    'LUXTRAD',  -- Traditional
    -- MISC bucket
    'ECOMMALL'  -- Ecommerce allowance (-$25)
  ])
$$;

GRANT EXECUTE ON FUNCTION public.is_portal_invoice_category(text)
  TO anon, authenticated, service_role;


-- ── Step 2: Recreate mv_portal_monthly_invoiced_actuals ──────────────────────
-- Now sourced from portal_acctivate_invoices + portal_acctivate_invoice_lines
-- with the product_class whitelist applied.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_matviews
    WHERE schemaname = 'public' AND matviewname = 'mv_portal_monthly_invoiced_actuals'
  ) THEN
    DROP MATERIALIZED VIEW public.mv_portal_monthly_invoiced_actuals CASCADE;
  ELSIF EXISTS (
    SELECT 1 FROM pg_views
    WHERE schemaname = 'public' AND viewname = 'mv_portal_monthly_invoiced_actuals'
  ) THEN
    DROP VIEW public.mv_portal_monthly_invoiced_actuals CASCADE;
  END IF;
END;
$$;

CREATE MATERIALIZED VIEW public.mv_portal_monthly_invoiced_actuals AS
SELECT
  EXTRACT(YEAR  FROM pai.invoice_date)::int                                    AS year,
  EXTRACT(MONTH FROM pai.invoice_date)::int                                    AS month_number,
  COALESCE(SUM(
    COALESCE(pail.line_amount::numeric, pail.invoice_detail_amount::numeric, 0)
  ), 0)::numeric                                                               AS invoiced_actual,
  0::numeric                                                                   AS invoiced_container,
  0::numeric                                                                   AS invoiced_warehouse,
  COUNT(DISTINCT pai.guid_invoice)::int                                        AS invoice_count
FROM public.portal_acctivate_invoices pai
JOIN public.portal_acctivate_invoice_lines pail
  ON pail.guid_invoice::text = pai.guid_invoice::text
WHERE pai.invoice_date IS NOT NULL
  AND NULLIF(TRIM(pail.product_id::text), '') IS NOT NULL
  AND public.is_portal_invoice_category(pail.product_class::text)
GROUP BY
  EXTRACT(YEAR  FROM pai.invoice_date)::int,
  EXTRACT(MONTH FROM pai.invoice_date)::int
ORDER BY 1, 2
WITH DATA;

GRANT SELECT ON public.mv_portal_monthly_invoiced_actuals
  TO anon, authenticated, service_role;


-- ── Step 3: Update get_portal_invoiced_lines ──────────────────────────────────
-- Dealer/Rep Reporting line-level source (SalesReporting, InvoiceDetailSheet,
-- useDealerSalesAggregates rep-scoped path).
-- Switched from dbo_Invoice (empty) to portal_acctivate_invoices with whitelist.

CREATE OR REPLACE FUNCTION public.get_portal_invoiced_lines()
RETURNS TABLE(
  metric_type      text,
  transaction_date date,
  year             int,
  month_number     int,
  dealer_name      text,
  customer_id      text,
  rep_name         text,
  rep_id           text,
  sku              text,
  description      text,
  brand_category   text,
  amount           numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    'invoiced'::text                                                              AS metric_type,
    pai.invoice_date::date                                                        AS transaction_date,
    EXTRACT(YEAR  FROM pai.invoice_date)::int                                     AS year,
    EXTRACT(MONTH FROM pai.invoice_date)::int                                     AS month_number,
    COALESCE(
      NULLIF(TRIM(dl.name::text),              ''),
      NULLIF(TRIM(pai.customer_name::text),    ''),
      pai.customer_id::text
    )                                                                             AS dealer_name,
    pai.customer_id::text                                                         AS customer_id,
    COALESCE(
      NULLIF(TRIM(pai.sales_rep_name::text), ''),
      NULLIF(TRIM(pai.sales_rep_id::text),   ''),
      'Unassigned'
    )                                                                             AS rep_name,
    COALESCE(NULLIF(TRIM(pai.sales_rep_id::text), ''), '')                        AS rep_id,
    pail.product_id::text                                                         AS sku,
    pail.description::text                                                        AS description,
    pail.product_class::text                                                      AS brand_category,
    COALESCE(pail.line_amount::numeric, pail.invoice_detail_amount::numeric, 0)   AS amount
  FROM public.portal_acctivate_invoices pai
  JOIN public.portal_acctivate_invoice_lines pail
    ON pail.guid_invoice::text = pai.guid_invoice::text
  LEFT JOIN public.dealers dl
    ON dl.acctivate_id = pai.customer_id::text
  WHERE pai.invoice_date IS NOT NULL
    AND NULLIF(TRIM(pail.product_id::text), '') IS NOT NULL
    AND public.is_portal_invoice_category(pail.product_class::text)
$$;

GRANT EXECUTE ON FUNCTION public.get_portal_invoiced_lines()
  TO anon, authenticated;


-- ── Step 4: Update kpi_monthly_invoice_rollup ─────────────────────────────────
-- Dealer-scoped invoice totals (MtdInvoicingCard dealer/rep-scoped path).
-- Switched from dbo_Invoice (empty) to portal_acctivate_invoices with whitelist.

CREATE OR REPLACE FUNCTION public.kpi_monthly_invoice_rollup(
  p_years      int[],
  p_dealer_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  year               int,
  month              int,
  invoiced           numeric,
  invoiced_container numeric,
  invoiced_warehouse numeric,
  invoice_count      int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXTRACT(YEAR  FROM pai.invoice_date)::int                                  AS year,
    EXTRACT(MONTH FROM pai.invoice_date)::int                                  AS month,
    COALESCE(SUM(
      COALESCE(pail.line_amount::numeric, pail.invoice_detail_amount::numeric, 0)
    ), 0)                                                                      AS invoiced,
    0::numeric                                                                 AS invoiced_container,
    0::numeric                                                                 AS invoiced_warehouse,
    COUNT(DISTINCT pai.guid_invoice)::int                                      AS invoice_count
  FROM public.portal_acctivate_invoices pai
  JOIN public.portal_acctivate_invoice_lines pail
    ON pail.guid_invoice::text = pai.guid_invoice::text
  LEFT JOIN public.dealers dl
    ON dl.acctivate_id = pai.customer_id::text
  WHERE pai.invoice_date IS NOT NULL
    AND NULLIF(TRIM(pail.product_id::text), '') IS NOT NULL
    AND public.is_portal_invoice_category(pail.product_class::text)
    AND EXTRACT(YEAR FROM pai.invoice_date)::int = ANY(p_years)
    AND (p_dealer_ids IS NULL OR dl.id = ANY(p_dealer_ids))
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

GRANT EXECUTE ON FUNCTION public.kpi_monthly_invoice_rollup(int[], uuid[])
  TO anon, authenticated, service_role;


-- ── Step 5: Refresh the materialized view ─────────────────────────────────────

REFRESH MATERIALIZED VIEW public.mv_portal_monthly_invoiced_actuals;


-- ── Verification query ─────────────────────────────────────────────────────────
-- Run separately to confirm MTD totals by brand.
-- Expected: Sea Winds ≈ $94,152 | Finn & Louise ≈ $85,542 | Lux ≈ $10,632 | MISC ≈ -$25
--
-- SELECT
--   CASE
--     WHEN UPPER(TRIM(pail.product_class::text)) IN ('CHATMAPL','CHATMIDN','MHVDARK','MHVLIGHT','PTBREEZE','RIOVISTA')
--       THEN 'Finn & Louise'
--     WHEN UPPER(TRIM(pail.product_class::text)) IN ('CMAYDRIF','CREDENZA','ISLAMORA','MIRAMAR','MONBLANC','MONBLEU','OCEANISL','PICKET','SURFSIDE')
--       THEN 'Sea Winds'
--     WHEN UPPER(TRIM(pail.product_class::text)) IN ('LUXCOAST','LUXTRANS','LUXTRAD')
--       THEN 'Lux Lighting'
--     WHEN UPPER(TRIM(pail.product_class::text)) = 'CABBED'
--       THEN 'Cabinet Beds (shared)'
--     WHEN UPPER(TRIM(pail.product_class::text)) = 'ECOMMALL'
--       THEN 'MISC'
--   END AS brand,
--   SUM(COALESCE(pail.line_amount::numeric, pail.invoice_detail_amount::numeric, 0)) AS total
-- FROM public.portal_acctivate_invoices pai
-- JOIN public.portal_acctivate_invoice_lines pail
--   ON pail.guid_invoice::text = pai.guid_invoice::text
-- WHERE pai.invoice_date >= date_trunc('month', CURRENT_DATE)
--   AND pai.invoice_date <  date_trunc('month', CURRENT_DATE) + interval '1 month'
--   AND NULLIF(TRIM(pail.product_id::text), '') IS NOT NULL
--   AND public.is_portal_invoice_category(pail.product_class::text)
-- GROUP BY 1
-- ORDER BY total DESC NULLS LAST;
