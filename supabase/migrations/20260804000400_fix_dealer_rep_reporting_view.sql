-- Recreate v_portal_dealer_rep_reporting_lines to fix August bookings ($0 bug).
--
-- Root cause: bookings previously used qty_ordered × original_price × (1 - pct),
-- which returned $0 when original_price is NULL (August orders).
--
-- Fix: bookings side now reads from v_portal_bookings_line_facts.net_booking_amount,
-- which applies COALESCE to fall back to amount - tariff - freight when
-- original_price is NULL.
--
-- Invoiced side is unchanged (dbo_Invoice + dbo_InvoiceDetail with existing
-- freight / cancelled / misc-charge exclusions).
--
-- ── Apply in Supabase SQL Editor ─────────────────────────────────────────────
--   Paste and run this file directly (view was created outside of migrations).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_portal_dealer_rep_reporting_lines AS

-- ── Bookings ──────────────────────────────────────────────────────────────────
SELECT
  'bookings'::text                                      AS metric_type,
  f.booking_date::date                                  AS transaction_date,
  EXTRACT(YEAR  FROM f.booking_date)::int               AS year,
  EXTRACT(MONTH FROM f.booking_date)::int               AS month_number,
  COALESCE(f.dealer_name, o."CustomerID")               AS dealer_name,
  o."CustomerID"                                        AS customer_id,
  sp."Name"                                             AS rep_name,
  f.guid_salesperson::text                              AS rep_id,
  f.sku,
  f.description,
  f.brand_category,
  f.net_booking_amount                                  AS amount
FROM public.v_portal_bookings_line_facts f
LEFT JOIN public."dbo_Orders" o
  ON o."GUIDOrder"::text = f.guid_order::text
LEFT JOIN public."dbo_SalespersonInfo" sp
  ON sp."GUIDSalesperson"::text = f.guid_salesperson::text
WHERE f.booking_date IS NOT NULL

UNION ALL

-- ── Invoiced ──────────────────────────────────────────────────────────────────
SELECT
  'invoiced'::text                                      AS metric_type,
  i."InvoiceDate"::date                                 AS transaction_date,
  EXTRACT(YEAR  FROM i."InvoiceDate")::int              AS year,
  EXTRACT(MONTH FROM i."InvoiceDate")::int              AS month_number,
  COALESCE(i."BillToName", i."CustomerID")              AS dealer_name,
  i."CustomerID"                                        AS customer_id,
  COALESCE(sp."Name", i."SalespersonName")              AS rep_name,
  i."GUIDSalesperson"::text                             AS rep_id,
  d."ProductID"                                         AS sku,
  d."Description"                                       AS description,
  d."ProductClass"                                      AS brand_category,
  d."Amount"::numeric                                   AS amount
FROM public."dbo_Invoice" i
JOIN public."dbo_InvoiceDetail" d
  ON d."GUIDInvoice" = i."GUIDInvoice"
LEFT JOIN public."dbo_SalespersonInfo" sp
  ON sp."GUIDSalesperson" = i."GUIDSalesperson"
WHERE i."InvoiceDate" IS NOT NULL
  AND COALESCE(d."Freight",       false) IS NOT TRUE
  AND COALESCE(d."LineCancelled", false) IS NOT TRUE
  AND (d."MiscChargeType" IS NULL OR trim(d."MiscChargeType") = '');

GRANT SELECT ON public.v_portal_dealer_rep_reporting_lines TO anon, authenticated;
