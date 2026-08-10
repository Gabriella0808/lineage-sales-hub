-- Fix historical invoice filtering (Jan–Jun 2026).
--
-- Root cause: portal_acctivate_invoice_lines.product_class was not populated for
-- Jan–Jun 2026. All lines for those months have blank product_class, so the
-- existing whitelist filter (is_portal_invoice_category) returns FALSE for every
-- historical line → $0 for every pre-July month.
--
-- Fix: new is_portal_invoice_line(product_class, product_id, description) function
-- with two paths:
--   Path 1 – product_class whitelist (July 2026+, codes are populated)
--   Path 2 – description keyword match (pre-July, blank product_class)
--             Charge lines are explicitly excluded in Path 2.
--
-- All three invoice sources are updated to call is_portal_invoice_line().
-- The old is_portal_invoice_category(text) function is left in place.
--
-- ── Apply in Supabase SQL Editor ──────────────────────────────────────────────
--   Paste and run the entire file. The final statement refreshes the MV.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── Step 1: Create is_portal_invoice_line() ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_portal_invoice_line(
  p_product_class text,
  p_product_id    text,
  p_description   text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    -- Path 1: exact product_class whitelist (populated July 2026 onward)
    UPPER(TRIM(COALESCE(p_product_class, ''))) = ANY(ARRAY[
      'CABBED',   'CHATMAPL', 'CHATMIDN', 'MHVDARK',  'MHVLIGHT', 'PTBREEZE', 'RIOVISTA',
      'CMAYDRIF', 'CREDENZA', 'ISLAMORA', 'MIRAMAR',  'MONBLANC', 'MONBLEU',  'OCEANISL',
      'PICKET',   'SURFSIDE',
      'LUXCOAST', 'LUXTRANS', 'LUXTRAD',
      'ECOMMALL'
    ])
    OR
    -- Path 2: description-based fallback for historical lines (blank product_class)
    (
      (p_product_class IS NULL OR TRIM(p_product_class) = '')
      -- Exclude known charge lines by product_id keyword
      AND NOT lower(COALESCE(p_product_id, '') || ' ' || COALESCE(p_description, ''))
            ~ 'tariff|freight|surcharge|ecsur|delivery|shipping charge'
      AND UPPER(TRIM(COALESCE(p_product_id, ''))) != ALL(ARRAY[
            'SHIP','IMPORT','CLOSEOUT','CCFEE',
            'TAX-FL','TAX-NJ','TAX-SC','TAX-MA','TAX-NC',
            'RETURN','QCFREIGH','QCFACTOR','QCINTERN','MAUI','COOP','DISCO','MISC'
          ])
      -- Must match a known collection name in description or product_id
      AND lower(COALESCE(p_description, '') || ' ' || COALESCE(p_product_id, ''))
            ~ 'islamorada|rio vista|monaco|surfside|cape may|miramar|ocean isle|picket fence|chatham|manhattan valley|point breeze|cabinet bed|venice|port royale|lux'
    )
$$;

GRANT EXECUTE ON FUNCTION public.is_portal_invoice_line(text, text, text)
  TO anon, authenticated, service_role;


-- ── Step 2: Rebuild mv_portal_monthly_invoiced_actuals ────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_matviews WHERE schemaname = 'public' AND matviewname = 'mv_portal_monthly_invoiced_actuals'
  ) THEN
    DROP MATERIALIZED VIEW public.mv_portal_monthly_invoiced_actuals CASCADE;
  ELSIF EXISTS (
    SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'mv_portal_monthly_invoiced_actuals'
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
  AND public.is_portal_invoice_line(
        pail.product_class::text,
        pail.product_id::text,
        pail.description::text
      )
GROUP BY
  EXTRACT(YEAR  FROM pai.invoice_date)::int,
  EXTRACT(MONTH FROM pai.invoice_date)::int
ORDER BY 1, 2
WITH DATA;

GRANT SELECT ON public.mv_portal_monthly_invoiced_actuals
  TO anon, authenticated, service_role;


-- ── Step 3: Rebuild get_portal_invoiced_lines() ───────────────────────────────

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
    -- For lines where product_class is populated, use it; otherwise derive from description.
    COALESCE(
      NULLIF(TRIM(pail.product_class::text), ''),
      CASE
        WHEN lower(COALESCE(pail.description, '')) ~ 'islamorada|miramar|ocean isle|surfside|cape may|monaco|picket fence|credenza|venice|port royale'
          THEN 'Sea Winds'
        WHEN lower(COALESCE(pail.description, '')) ~ 'rio vista|chatham|manhattan valley|point breeze|cabinet bed'
          THEN 'Finn & Louise'
        WHEN lower(COALESCE(pail.description, '') || ' ' || COALESCE(pail.product_id, '')) ~ 'lux'
          THEN 'Lux Lighting'
        ELSE 'Other'
      END
    )                                                                             AS brand_category,
    COALESCE(pail.line_amount::numeric, pail.invoice_detail_amount::numeric, 0)   AS amount
  FROM public.portal_acctivate_invoices pai
  JOIN public.portal_acctivate_invoice_lines pail
    ON pail.guid_invoice::text = pai.guid_invoice::text
  LEFT JOIN public.dealers dl
    ON dl.acctivate_id = pai.customer_id::text
  WHERE pai.invoice_date IS NOT NULL
    AND public.is_portal_invoice_line(
          pail.product_class::text,
          pail.product_id::text,
          pail.description::text
        )
$$;

GRANT EXECUTE ON FUNCTION public.get_portal_invoiced_lines()
  TO anon, authenticated;


-- ── Step 4: Rebuild kpi_monthly_invoice_rollup() ─────────────────────────────

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
    AND public.is_portal_invoice_line(
          pail.product_class::text,
          pail.product_id::text,
          pail.description::text
        )
    AND EXTRACT(YEAR FROM pai.invoice_date)::int = ANY(p_years)
    AND (p_dealer_ids IS NULL OR dl.id = ANY(p_dealer_ids))
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

GRANT EXECUTE ON FUNCTION public.kpi_monthly_invoice_rollup(int[], uuid[])
  TO anon, authenticated, service_role;


-- ── Step 5: Refresh the materialized view ─────────────────────────────────────

REFRESH MATERIALIZED VIEW public.mv_portal_monthly_invoiced_actuals;


-- ── Verification query (run separately after applying) ────────────────────────
-- Expected: non-zero for all months Jan–Aug 2026.
--
-- SELECT year, month_number, invoiced_actual, invoice_count
-- FROM public.mv_portal_monthly_invoiced_actuals
-- WHERE year = 2026
-- ORDER BY month_number;
