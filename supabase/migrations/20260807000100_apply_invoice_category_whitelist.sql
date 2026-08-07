-- Apply invoice category whitelist: Sea Winds, Finn & Louise, Lux Lighting, MISC
--
-- Root cause: all three invoice sources (mv_portal_monthly_invoiced_actuals,
-- kpi_monthly_invoice_rollup, get_portal_invoiced_lines) aggregate every
-- ProductClass in dbo_InvoiceDetail, pulling in non-reporting categories and
-- inflating the MTD total from $190,301 to $226,221.
--
-- Fix: add a shared category whitelist to every invoice path so only approved
-- brands are counted. No source data is deleted — this is a reporting filter.
--
-- Expected MTD result after applying:
--   Sea Winds    ≈ $94,152
--   Finn & Louise ≈ $85,542
--   Lux Lighting  ≈ $10,632
--   MISC          ≈   -$25
--   Total         ≈ $190,301
--
-- ── Apply in Supabase SQL Editor ──────────────────────────────────────────────
--   Paste and run this entire file in one shot.
--   The final line refreshes mv_portal_monthly_invoiced_actuals immediately.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── Step 1: Shared category helper ───────────────────────────────────────────
-- Single source of truth for the approved-category predicate.
-- Used in Steps 2–4 to keep the whitelist consistent across all three sources.

CREATE OR REPLACE FUNCTION public.is_portal_invoice_category(product_class text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT (
    -- Sea Winds (SeaWinds, Sea Wind, SW)
    product_class ILIKE 'sea wind%'
    OR product_class ILIKE 'seawind%'
    OR UPPER(TRIM(product_class)) = 'SW'
    -- Finn & Louise (Finn & Loui, FINNLOU, Finn Lou, etc.)
    OR product_class ILIKE 'finn%'
    -- Lux Lighting (Lux, LUX)
    OR product_class ILIKE 'lux%'
    -- MISC (credit / miscellaneous product lines)
    OR UPPER(TRIM(product_class)) = 'MISC'
    OR UPPER(TRIM(product_class)) = 'MISCELLANEOUS'
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_portal_invoice_category(text)
  TO anon, authenticated, service_role;


-- ── Step 2: Recreate mv_portal_monthly_invoiced_actuals ──────────────────────
-- Company-wide source for Live KPI MTD card and monthly chart.
-- Previously backed by a different aggregate that lacked category filtering.
-- Now reads directly from dbo_Invoice + dbo_InvoiceDetail with the whitelist.

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
WITH filtered_lines AS (
  SELECT
    i."GUIDInvoice",
    i."InvoiceDate",
    i."GUIDBranch",
    SUM(d."Amount"::numeric) AS line_total
  FROM public."dbo_Invoice" i
  JOIN public."dbo_InvoiceDetail" d
    ON d."GUIDInvoice" = i."GUIDInvoice"
  WHERE i."InvoiceDate" IS NOT NULL
    AND COALESCE(d."Freight",       false) IS NOT TRUE
    AND COALESCE(d."LineCancelled", false) IS NOT TRUE
    AND (d."MiscChargeType" IS NULL OR TRIM(d."MiscChargeType"::text) = '')
    AND public.is_portal_invoice_category(d."ProductClass"::text)
  GROUP BY i."GUIDInvoice", i."InvoiceDate", i."GUIDBranch"
)
SELECT
  EXTRACT(YEAR  FROM fl."InvoiceDate")::int     AS year,
  EXTRACT(MONTH FROM fl."InvoiceDate")::int     AS month_number,
  COALESCE(SUM(fl.line_total), 0)::numeric      AS invoiced_actual,
  COALESCE(SUM(CASE
    WHEN fl."GUIDBranch" = 'C96A46A5-7EDC-4B33-AF2E-A0BB16D91320'::uuid
    THEN fl.line_total ELSE 0
  END), 0)::numeric                             AS invoiced_container,
  COALESCE(SUM(CASE
    WHEN fl."GUIDBranch" IN (
      'E38CF43B-F51F-45BB-B6F3-862ACFCF951F'::uuid,
      '245DDE60-3911-48EA-9A77-C730843CD8E2'::uuid
    ) THEN fl.line_total ELSE 0
  END), 0)::numeric                             AS invoiced_warehouse,
  COUNT(*)::int                                 AS invoice_count
FROM filtered_lines fl
GROUP BY
  EXTRACT(YEAR  FROM fl."InvoiceDate")::int,
  EXTRACT(MONTH FROM fl."InvoiceDate")::int
ORDER BY 1, 2
WITH DATA;

GRANT SELECT ON public.mv_portal_monthly_invoiced_actuals
  TO anon, authenticated, service_role;


-- ── Step 3: Update kpi_monthly_invoice_rollup ─────────────────────────────────
-- Dealer-scoped invoice totals (MtdInvoicingCard dealer path).
-- Add is_portal_invoice_category() to the product_lines CTE filter.

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
  WITH product_lines AS (
    SELECT
      d."GUIDInvoice",
      SUM(d."Amount"::numeric) AS product_subtotal
    FROM public."dbo_InvoiceDetail" d
    WHERE COALESCE(d."Freight",       false) IS NOT TRUE
      AND COALESCE(d."LineCancelled", false) IS NOT TRUE
      AND (d."MiscChargeType" IS NULL OR trim(d."MiscChargeType") = '')
      AND public.is_portal_invoice_category(d."ProductClass"::text)
    GROUP BY d."GUIDInvoice"
  )
  SELECT
    EXTRACT(YEAR  FROM i."InvoiceDate")::int AS year,
    EXTRACT(MONTH FROM i."InvoiceDate")::int AS month,
    COALESCE(SUM(pl.product_subtotal), 0) AS invoiced,
    COALESCE(SUM(CASE
      WHEN i."GUIDBranch" = 'C96A46A5-7EDC-4B33-AF2E-A0BB16D91320'::uuid
      THEN pl.product_subtotal ELSE 0
    END), 0) AS invoiced_container,
    COALESCE(SUM(CASE
      WHEN i."GUIDBranch" IN (
        'E38CF43B-F51F-45BB-B6F3-862ACFCF951F'::uuid,
        '245DDE60-3911-48EA-9A77-C730843CD8E2'::uuid
      ) THEN pl.product_subtotal ELSE 0
    END), 0) AS invoiced_warehouse,
    COUNT(*)::int AS invoice_count
  FROM public."dbo_Invoice" i
  JOIN product_lines pl ON pl."GUIDInvoice" = i."GUIDInvoice"
  LEFT JOIN public.dealers dl ON dl.acctivate_id = i."CustomerID"
  WHERE EXTRACT(YEAR FROM i."InvoiceDate")::int = ANY(p_years)
    AND i."InvoiceDate" IS NOT NULL
    AND (p_dealer_ids IS NULL OR dl.id = ANY(p_dealer_ids))
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

GRANT EXECUTE ON FUNCTION public.kpi_monthly_invoice_rollup(int[], uuid[])
  TO anon, authenticated, service_role;


-- ── Step 4: Update get_portal_invoiced_lines ──────────────────────────────────
-- Source for v_portal_dealer_rep_reporting_lines → SalesReporting, InvoiceDetailSheet,
-- and useDealerSalesAggregates rep-scoped path.

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
    'invoiced'::text                                                 AS metric_type,
    i."InvoiceDate"::date                                            AS transaction_date,
    EXTRACT(YEAR  FROM i."InvoiceDate")::int                         AS year,
    EXTRACT(MONTH FROM i."InvoiceDate")::int                         AS month_number,
    COALESCE(
      NULLIF(TRIM(dl.name::text),        ''),
      NULLIF(TRIM(i."BillToName"::text), ''),
      i."CustomerID"::text
    )                                                                AS dealer_name,
    i."CustomerID"::text                                             AS customer_id,
    COALESCE(
      NULLIF(TRIM(i."SalespersonName"::text), ''),
      NULLIF(TRIM(i."SalespersonID"::text),   ''),
      'Unassigned'
    )                                                                AS rep_name,
    COALESCE(
      NULLIF(TRIM(i."SalespersonID"::text), ''),
      i."GUIDSalesperson"::text
    )                                                                AS rep_id,
    d."ProductID"::text                                              AS sku,
    d."Description"::text                                            AS description,
    d."ProductClass"::text                                           AS brand_category,
    d."Amount"::numeric                                              AS amount
  FROM public."dbo_Invoice" i
  JOIN public."dbo_InvoiceDetail" d
    ON d."GUIDInvoice" = i."GUIDInvoice"
  LEFT JOIN public.dealers dl
    ON dl.acctivate_id = i."CustomerID"
  WHERE i."InvoiceDate" IS NOT NULL
    AND COALESCE(d."Freight",       false) IS NOT TRUE
    AND COALESCE(d."LineCancelled", false) IS NOT TRUE
    AND (d."MiscChargeType" IS NULL OR TRIM(d."MiscChargeType"::text) = '')
    AND public.is_portal_invoice_category(d."ProductClass"::text)
$$;

GRANT EXECUTE ON FUNCTION public.get_portal_invoiced_lines()
  TO anon, authenticated;


-- ── Step 5: Refresh the materialized view ─────────────────────────────────────
-- Populates mv_portal_monthly_invoiced_actuals with the filtered data immediately.
-- After each Skyvia / Acctivate sync, run:
--   REFRESH MATERIALIZED VIEW public.mv_portal_monthly_invoiced_actuals;

REFRESH MATERIALIZED VIEW public.mv_portal_monthly_invoiced_actuals;


-- ── Verification query (run separately to confirm the $190,301 MTD total) ─────
--
-- SELECT
--   CASE
--     WHEN d."ProductClass"::text ILIKE 'sea wind%'
--       OR d."ProductClass"::text ILIKE 'seawind%'
--       OR UPPER(TRIM(d."ProductClass"::text)) = 'SW'  THEN 'Sea Winds'
--     WHEN d."ProductClass"::text ILIKE 'finn%'         THEN 'Finn & Louise'
--     WHEN d."ProductClass"::text ILIKE 'lux%'          THEN 'Lux Lighting'
--     ELSE 'MISC'
--   END                                   AS category,
--   SUM(d."Amount"::numeric)              AS total
-- FROM public."dbo_Invoice" i
-- JOIN public."dbo_InvoiceDetail" d ON d."GUIDInvoice" = i."GUIDInvoice"
-- WHERE i."InvoiceDate" >= date_trunc('month', CURRENT_DATE)
--   AND i."InvoiceDate" <  date_trunc('month', CURRENT_DATE) + interval '1 month'
--   AND COALESCE(d."Freight",       false) IS NOT TRUE
--   AND COALESCE(d."LineCancelled", false) IS NOT TRUE
--   AND (d."MiscChargeType" IS NULL OR TRIM(d."MiscChargeType"::text) = '')
--   AND public.is_portal_invoice_category(d."ProductClass"::text)
-- GROUP BY 1
-- UNION ALL
-- SELECT 'TOTAL', SUM(d."Amount"::numeric)
-- FROM public."dbo_Invoice" i
-- JOIN public."dbo_InvoiceDetail" d ON d."GUIDInvoice" = i."GUIDInvoice"
-- WHERE i."InvoiceDate" >= date_trunc('month', CURRENT_DATE)
--   AND i."InvoiceDate" <  date_trunc('month', CURRENT_DATE) + interval '1 month'
--   AND COALESCE(d."Freight",       false) IS NOT TRUE
--   AND COALESCE(d."LineCancelled", false) IS NOT TRUE
--   AND (d."MiscChargeType" IS NULL OR TRIM(d."MiscChargeType"::text) = '')
--   AND public.is_portal_invoice_category(d."ProductClass"::text)
-- ORDER BY total DESC NULLS LAST;
