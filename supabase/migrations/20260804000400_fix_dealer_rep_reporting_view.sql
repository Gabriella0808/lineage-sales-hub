-- Recreate v_portal_dealer_rep_reporting_lines.
--
-- BOOKINGS side (unchanged):
--   Uses v_portal_bookings_line_facts.net_booking_amount — already has the
--   corrected NULL-safe formula for August orders.
--   Rep name is resolved via a deduped CTE from dbo_Orders (GUIDSalesperson).
--
-- INVOICED side (replaced):
--   The old dbo_Invoice + dbo_InvoiceDetail source does not include August
--   invoices. Replaced with portal_acctivate_invoices + portal_acctivate_invoice_lines,
--   the same Skyvia-synced source that backs mv_portal_monthly_invoiced_actuals
--   and the Live KPI.
--
--   Exclusion rule: only rows where product_id is a real SKU (NOT NULL / non-empty).
--   Freight, tariff surcharges, shipping, and QC charge lines have no product_id.
--
--   posted_to_ar = true mirrors the filter used in kpi_monthly_portal_invoice_rollup.
--
-- ── Apply in Supabase SQL Editor ─────────────────────────────────────────────
--   Paste and run this file directly (view was created outside of migrations).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_portal_dealer_rep_reporting_lines AS

-- ── Salesperson lookup (deduped by GUIDSalesperson from dbo_Orders) ───────────
-- Joining directly to dbo_Orders for rep name via GUIDSalesperson would produce
-- one row per order for each GUID, causing duplicates. This CTE produces a single
-- (salesperson_id, salesperson_name) row per GUID to use as a point lookup.
WITH order_salesperson_lookup AS (
  SELECT
    "GUIDSalesperson"::text                                   AS guid_salesperson,
    MAX(NULLIF(TRIM("SalespersonID"::text),   ''))            AS salesperson_id,
    MAX(NULLIF(TRIM("SalespersonName"::text), ''))            AS salesperson_name
  FROM public."dbo_Orders"
  WHERE "GUIDSalesperson" IS NOT NULL
  GROUP BY "GUIDSalesperson"::text
)

-- ── Bookings ──────────────────────────────────────────────────────────────────
-- All text columns are explicitly cast to ::text so this branch's output types
-- match the invoiced branch exactly and never conflict with character varying
-- columns from Acctivate tables (CustomerID, SalespersonName, etc. are varchar).
SELECT
  'bookings'::text                                                              AS metric_type,
  f.booking_date::date                                                          AS transaction_date,
  EXTRACT(YEAR  FROM f.booking_date)::int                                       AS year,
  EXTRACT(MONTH FROM f.booking_date)::int                                       AS month_number,
  COALESCE(f.dealer_name::text, o."CustomerID"::text)                          AS dealer_name,
  o."CustomerID"::text                                                          AS customer_id,
  COALESCE(
    osl.salesperson_name,
    NULLIF(o."SalespersonName"::text, ''),
    NULLIF(o."_Rep1"::text,           ''),
    NULLIF(o."_Rep2"::text,           ''),
    f.guid_salesperson::text
  )::text                                                                       AS rep_name,
  COALESCE(NULLIF(osl.salesperson_id, ''), f.guid_salesperson::text)::text     AS rep_id,
  f.sku::text                                                                   AS sku,
  f.description::text                                                           AS description,
  f.brand_category::text                                                        AS brand_category,
  f.net_booking_amount::numeric                                                 AS amount
FROM public.v_portal_bookings_line_facts f
LEFT JOIN public."dbo_Orders" o
  ON o."GUIDOrder"::text = f.guid_order::text
LEFT JOIN order_salesperson_lookup osl
  ON osl.guid_salesperson = f.guid_salesperson::text
WHERE f.booking_date IS NOT NULL

UNION ALL

-- ── Invoiced ──────────────────────────────────────────────────────────────────
-- Source: portal_acctivate_invoices (header) + portal_acctivate_invoice_lines (lines).
-- This is the same Skyvia-synced source used by mv_portal_monthly_invoiced_actuals
-- and the Live KPI, so it includes August invoices that dbo_Invoice lacks.
--
-- Join key: guid_invoice (present on both tables as text / uuid — cast to text for safety).
--
-- Exclusion: NULLIF(TRIM(pail.product_id), '') IS NOT NULL keeps only real SKU lines.
-- Freight, tariff surcharges, shipping charges, and QC lines carry no product_id.
SELECT
  'invoiced'::text                                                              AS metric_type,
  pai.invoice_date::date                                                        AS transaction_date,
  EXTRACT(YEAR  FROM pai.invoice_date)::int                                     AS year,
  EXTRACT(MONTH FROM pai.invoice_date)::int                                     AS month_number,
  COALESCE(NULLIF(pai.customer_name::text, ''), pai.customer_id::text)         AS dealer_name,
  pai.customer_id::text                                                         AS customer_id,
  COALESCE(NULLIF(pai.sales_rep_name::text, ''), pai.sales_rep_id::text)       AS rep_name,
  pai.sales_rep_id::text                                                        AS rep_id,
  pail.product_id::text                                                         AS sku,
  pail.description::text                                                        AS description,
  pail.product_class::text                                                      AS brand_category,
  COALESCE(pail.line_amount::numeric, pail.invoice_detail_amount::numeric, 0)  AS amount
FROM public.portal_acctivate_invoices pai
JOIN public.portal_acctivate_invoice_lines pail
  ON pail.guid_invoice::text = pai.guid_invoice::text
WHERE pai.invoice_date IS NOT NULL
  AND NULLIF(TRIM(pail.product_id::text), '') IS NOT NULL;

GRANT SELECT ON public.v_portal_dealer_rep_reporting_lines TO anon, authenticated;
