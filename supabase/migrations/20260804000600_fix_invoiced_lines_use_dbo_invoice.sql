-- Fix: get_portal_invoiced_lines() rewritten to use dbo_Invoice + dbo_InvoiceDetail.
--
-- ── Root cause ───────────────────────────────────────────────────────────────
-- The previous implementation read portal_acctivate_invoices /
-- portal_acctivate_invoice_lines.  That table appears to hold only recent data
-- (explains Total Invoices = $97K for Aug 1-5 MTD but $0 for the Jan 2024 –
-- Aug 2026 lifetime range).
--
-- dbo_Invoice / dbo_InvoiceDetail are the complete Skyvia-synced Acctivate
-- tables used by kpi_monthly_invoice_rollup (which already works in Live KPI).
-- Using the same tables with identical exclusion logic guarantees Dealer/Rep
-- Reporting invoice totals reconcile to Live KPI for every date range.
--
-- ── Exclusion logic (identical to kpi_monthly_invoice_rollup) ────────────────
--   • Freight = true         → exclude  (freight/shipping lines)
--   • LineCancelled = true   → exclude  (voided lines)
--   • MiscChargeType IS SET  → exclude  (misc surcharges, AvaTax, etc.)
--
-- ── Rep / dealer name resolution ─────────────────────────────────────────────
--   • dealer_name : dealers.name (acctivate_id join) → BillToName → CustomerID
--   • rep_name    : SalespersonName → SalespersonID → 'Unassigned'
--   • rep_id      : SalespersonID → GUIDSalesperson text (internal; never shown)
--   • brand_category : dbo_InvoiceDetail.ProductClass
--
-- ── Also fixes ───────────────────────────────────────────────────────────────
-- Recreates v_portal_dealer_rep_reporting_lines so the bookings branch also
-- falls back to 'Unassigned' (instead of a raw UUID) when no salesperson name
-- is available — prevents UUID rows in Rep Reporting grouping.
--
-- ── Apply ─────────────────────────────────────────────────────────────────────
--   Paste and run the entire file in the Supabase SQL Editor in one shot.
--   Run AFTER migration 000400 (which creates get_portal_invoiced_lines() and
--   v_portal_dealer_rep_reporting_lines for the first time).
-- ─────────────────────────────────────────────────────────────────────────────


-- ── Step 1: replace get_portal_invoiced_lines() ───────────────────────────────

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

GRANT EXECUTE ON FUNCTION public.get_portal_invoiced_lines() TO anon, authenticated;


-- ── Step 2: recreate v_portal_dealer_rep_reporting_lines ─────────────────────
-- Bookings branch: replace the last-resort UUID fallback for rep_name with
-- 'Unassigned' so Rep Reporting never displays a raw GUID as a rep name.
-- The invoiced branch simply calls the updated get_portal_invoiced_lines().

CREATE OR REPLACE VIEW public.v_portal_dealer_rep_reporting_lines AS

WITH order_salesperson_lookup AS (
  SELECT
    "GUIDSalesperson"::text                                    AS guid_salesperson,
    MAX(NULLIF(TRIM("SalespersonID"::text),   ''))             AS salesperson_id,
    MAX(NULLIF(TRIM("SalespersonName"::text), ''))             AS salesperson_name
  FROM public."dbo_Orders"
  WHERE "GUIDSalesperson" IS NOT NULL
  GROUP BY "GUIDSalesperson"::text
)

-- ── Bookings ─────────────────────────────────────────────────────────────────
SELECT
  'bookings'::text                                                               AS metric_type,
  f.booking_date::date                                                           AS transaction_date,
  EXTRACT(YEAR  FROM f.booking_date)::int                                        AS year,
  EXTRACT(MONTH FROM f.booking_date)::int                                        AS month_number,
  COALESCE(f.dealer_name::text, o."CustomerID"::text)                           AS dealer_name,
  o."CustomerID"::text                                                           AS customer_id,
  COALESCE(
    osl.salesperson_name,
    NULLIF(o."SalespersonName"::text, ''),
    NULLIF(o."_Rep1"::text,           ''),
    NULLIF(o."_Rep2"::text,           ''),
    'Unassigned'
  )::text                                                                        AS rep_name,
  COALESCE(NULLIF(osl.salesperson_id, ''), f.guid_salesperson::text)::text      AS rep_id,
  f.sku::text                                                                    AS sku,
  f.description::text                                                            AS description,
  f.brand_category::text                                                         AS brand_category,
  f.net_booking_amount::numeric                                                  AS amount
FROM public.v_portal_bookings_line_facts f
LEFT JOIN public."dbo_Orders" o
  ON o."GUIDOrder"::text = f.guid_order::text
LEFT JOIN order_salesperson_lookup osl
  ON osl.guid_salesperson = f.guid_salesperson::text
WHERE f.booking_date IS NOT NULL

UNION ALL

-- ── Invoiced (via updated SECURITY DEFINER helper) ────────────────────────────
SELECT * FROM public.get_portal_invoiced_lines();

GRANT SELECT ON public.v_portal_dealer_rep_reporting_lines TO anon, authenticated;


-- ── Reconciliation checks (run separately to verify) ─────────────────────────
--
-- After running, paste each block individually to verify totals match:
--
-- 1. Live KPI bookings for Aug 1-5 (direct from the same source):
--    SELECT SUM(net_booking_amount)
--    FROM public.v_portal_bookings_line_facts
--    WHERE booking_date >= '2026-08-01' AND booking_date < '2026-08-06';
--
-- 2. Dealer Reporting bookings for Aug 1-5 (should equal #1):
--    SELECT SUM(amount)
--    FROM public.v_portal_dealer_rep_reporting_lines
--    WHERE metric_type = 'bookings'
--      AND transaction_date >= '2026-08-01'
--      AND transaction_date < '2026-08-06';
--
-- 3. Live KPI invoiced for Aug 1-5 (direct from same source as kpi_monthly_invoice_rollup):
--    SELECT SUM(d."Amount"::numeric)
--    FROM public."dbo_Invoice" i
--    JOIN public."dbo_InvoiceDetail" d ON d."GUIDInvoice" = i."GUIDInvoice"
--    WHERE i."InvoiceDate"::date >= '2026-08-01'
--      AND i."InvoiceDate"::date < '2026-08-06'
--      AND COALESCE(d."Freight", false) IS NOT TRUE
--      AND COALESCE(d."LineCancelled", false) IS NOT TRUE
--      AND (d."MiscChargeType" IS NULL OR TRIM(d."MiscChargeType"::text) = '');
--
-- 4. Dealer Reporting invoiced for Aug 1-5 (should equal #3):
--    SELECT SUM(amount)
--    FROM public.v_portal_dealer_rep_reporting_lines
--    WHERE metric_type = 'invoiced'
--      AND transaction_date >= '2026-08-01'
--      AND transaction_date < '2026-08-06';
