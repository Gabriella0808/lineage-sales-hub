-- Recreate v_portal_dealer_rep_reporting_lines to fix August bookings ($0 bug).
--
-- Root cause: bookings previously used qty_ordered × original_price × (1 - pct),
-- which returned $0 when original_price is NULL (August orders).
--
-- Fix: bookings side now reads from v_portal_bookings_line_facts.net_booking_amount,
-- which applies COALESCE to fall back to amount - tariff - freight when
-- original_price is NULL.
--
-- Rep name: dbo_Orders.SalespersonName is used directly (denormalized by Acctivate).
-- Fallback chain: SalespersonName → _Rep1 → _Rep2 → guid_salesperson (never a raw UUID).
-- dbo_SalespersonInfo does not exist in this schema — do not reference it.
--
-- Invoiced side is unchanged (dbo_Invoice + dbo_InvoiceDetail with existing
-- freight / cancelled / misc-charge exclusions). dbo_Invoice.SalespersonName
-- is used directly; no secondary join required.
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
SELECT
  'invoiced'::text                                                              AS metric_type,
  i."InvoiceDate"::date                                                         AS transaction_date,
  EXTRACT(YEAR  FROM i."InvoiceDate")::int                                      AS year,
  EXTRACT(MONTH FROM i."InvoiceDate")::int                                      AS month_number,
  COALESCE(i."BillToName"::text, i."CustomerID"::text)                         AS dealer_name,
  i."CustomerID"::text                                                          AS customer_id,
  COALESCE(NULLIF(i."SalespersonName"::text, ''), i."SalespersonID"::text)     AS rep_name,
  i."GUIDSalesperson"::text                                                     AS rep_id,
  d."ProductID"::text                                                           AS sku,
  d."Description"::text                                                         AS description,
  d."ProductClass"::text                                                        AS brand_category,
  d."Amount"::numeric                                                           AS amount
FROM public."dbo_Invoice" i
JOIN public."dbo_InvoiceDetail" d
  ON d."GUIDInvoice" = i."GUIDInvoice"
WHERE i."InvoiceDate" IS NOT NULL
  AND COALESCE(d."Freight",       false) IS NOT TRUE
  AND COALESCE(d."LineCancelled", false) IS NOT TRUE
  AND (d."MiscChargeType" IS NULL OR trim(d."MiscChargeType") = '');

GRANT SELECT ON public.v_portal_dealer_rep_reporting_lines TO anon, authenticated;
