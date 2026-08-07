-- REVERT: Remove invoice category filter while we identify correct ProductClass values.
--
-- The previous migration (000100) applied a ProductClass whitelist that filtered
-- out all invoice data because the actual values in dbo_InvoiceDetail don't match
-- the assumed patterns. This migration restores all three invoice sources to show
-- the full invoice total (same base exclusions as before: Freight, LineCancelled,
-- MiscChargeType). A corrected whitelist will be applied once the actual
-- ProductClass values are confirmed via the diagnostic query at the bottom.
--
-- ── Apply in Supabase SQL Editor ──────────────────────────────────────────────
--   Paste and run this entire file. It rebuilds the MV and refreshes it.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── Step 1: Recreate mv_portal_monthly_invoiced_actuals without category filter ──

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

REFRESH MATERIALIZED VIEW public.mv_portal_monthly_invoiced_actuals;


-- ── Step 2: Revert kpi_monthly_invoice_rollup (remove category filter) ─────────

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


-- ── Step 3: Revert get_portal_invoiced_lines (remove category filter) ──────────

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
$$;

GRANT EXECUTE ON FUNCTION public.get_portal_invoiced_lines()
  TO anon, authenticated;


-- ── Diagnostic query — run this separately AFTER applying the revert ───────────
-- Shows every distinct ProductClass value with its MTD line count and total.
-- Share the results so the correct whitelist patterns can be written.
--
-- SELECT
--   COALESCE(NULLIF(TRIM(d."ProductClass"::text), ''), '(blank)') AS product_class,
--   COUNT(*)                          AS line_count,
--   SUM(d."Amount"::numeric)          AS total_amount
-- FROM public."dbo_Invoice" i
-- JOIN public."dbo_InvoiceDetail" d ON d."GUIDInvoice" = i."GUIDInvoice"
-- WHERE i."InvoiceDate" >= date_trunc('month', CURRENT_DATE)
--   AND i."InvoiceDate" <  date_trunc('month', CURRENT_DATE) + interval '1 month'
--   AND COALESCE(d."Freight",       false) IS NOT TRUE
--   AND COALESCE(d."LineCancelled", false) IS NOT TRUE
--   AND (d."MiscChargeType" IS NULL OR TRIM(d."MiscChargeType"::text) = '')
-- GROUP BY 1
-- ORDER BY SUM(d."Amount"::numeric) DESC NULLS LAST;
