-- Add invoice_number to the dealer/rep reporting invoice line function.
--
-- get_portal_invoiced_lines() previously omitted invoice_number even though
-- v_portal_invoice_line_facts carries it.  Gabby needs Jan–July line-level
-- detail (not monthly totals) in Dealer and Rep Reporting, and invoice_number
-- is a required field for that detail view.
--
-- PostgreSQL does not allow CREATE OR REPLACE to change a function's return
-- type (adding a column counts as a change), so we DROP CASCADE and recreate.
-- CASCADE also drops v_portal_dealer_rep_reporting_lines, which we rebuild
-- below with invoice_number in the invoiced branch (NULL for bookings, since
-- bookings don't carry an invoice reference).
--
-- Source investigation summary (run before writing this migration):
--   • Previous description-keyword fallback (000807000400): Jan $630K–May $650K
--     (30-35% below Andrew) — worse than current implementation.
--   • dbo_Invoice, dealer_invoices, qb_invoices: empty for Jan–Jul 2026.
--   • stg_invoice_detail_pnl_backfill: identical data to portal_acctivate_invoice_lines.
--   • Current v_portal_invoice_line_facts is the best available source.
--
-- No source data is modified.  Changes are function + view layer only.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Rebuild get_portal_invoiced_lines() with invoice_number
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_portal_invoiced_lines() CASCADE;

CREATE FUNCTION public.get_portal_invoiced_lines()
RETURNS TABLE (
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
  amount           numeric,
  invoice_number   text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    'invoiced'::text                              AS metric_type,
    f.invoice_date                                AS transaction_date,
    EXTRACT(YEAR  FROM f.invoice_date)::int       AS year,
    EXTRACT(MONTH FROM f.invoice_date)::int       AS month_number,
    f.dealer_name                                 AS dealer_name,
    f.customer_id                                 AS customer_id,
    f.salesperson_name                            AS rep_name,
    f.salesperson_id                              AS rep_id,
    f.product_id                                  AS sku,
    f.description                                 AS description,
    f.display_category                            AS brand_category,
    f.net_invoice_amount                          AS amount,
    f.invoice_number                              AS invoice_number
  FROM public.v_portal_invoice_line_facts f
$$;

GRANT EXECUTE ON FUNCTION public.get_portal_invoiced_lines()
  TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rebuild v_portal_dealer_rep_reporting_lines
--    (dropped by CASCADE above; bookings branch carries NULL invoice_number)
-- ─────────────────────────────────────────────────────────────────────────────

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
  f.net_booking_amount::numeric                                                  AS amount,
  NULL::text                                                                     AS invoice_number
FROM public.v_portal_bookings_line_facts f
LEFT JOIN public."dbo_Orders" o
  ON o."GUIDOrder"::text = f.guid_order::text
LEFT JOIN order_salesperson_lookup osl
  ON osl.guid_salesperson = f.guid_salesperson::text
WHERE f.booking_date IS NOT NULL

UNION ALL

-- ── Invoiced ─────────────────────────────────────────────────────────────────
SELECT
  metric_type,
  transaction_date,
  year,
  month_number,
  dealer_name,
  customer_id,
  rep_name,
  rep_id,
  sku,
  description,
  brand_category,
  amount,
  invoice_number
FROM public.get_portal_invoiced_lines();

GRANT SELECT ON public.v_portal_dealer_rep_reporting_lines TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification (run manually after deploying)
-- ─────────────────────────────────────────────────────────────────────────────
/*
-- Confirm invoice_number is populated for Jan-Jul invoiced rows:
SELECT
  TO_CHAR(transaction_date, 'YYYY-MM') AS month,
  COUNT(*) AS lines,
  COUNT(invoice_number) AS with_invoice_number,
  ROUND(SUM(amount), 0) AS total
FROM public.v_portal_dealer_rep_reporting_lines
WHERE metric_type = 'invoiced'
  AND transaction_date >= '2026-01-01' AND transaction_date < '2026-08-01'
GROUP BY 1 ORDER BY 1;
*/
