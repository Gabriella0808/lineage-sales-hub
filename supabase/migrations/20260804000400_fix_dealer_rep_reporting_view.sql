-- Recreate v_portal_dealer_rep_reporting_lines.
--
-- ── Why the invoiced side uses a SECURITY DEFINER helper ─────────────────────
--
-- portal_acctivate_invoices and portal_acctivate_invoice_lines are Skyvia-synced
-- tables that may have Row Level Security (RLS) enabled.  Even when the view
-- owner (postgres) has access, PostgreSQL applies RLS using the CALLING user's
-- identity — so authenticated PostgREST queries see 0 rows for the invoiced
-- branch while the SQL Editor (running as postgres / BYPASSRLS) sees data.
--
-- The existing kpi_monthly_portal_invoice_rollup already solves this with
-- SECURITY DEFINER: the function runs as postgres (BYPASSRLS), bypassing RLS
-- on portal_acctivate_invoices.  We apply the same pattern here via a helper
-- function get_portal_invoiced_lines() that the view's invoiced branch calls.
--
-- ── Apply in Supabase SQL Editor ─────────────────────────────────────────────
--   Paste and run this entire file in one shot.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── Step 1: SECURITY DEFINER helper for invoiced lines ────────────────────────
-- Owned by the executing user (postgres in SQL Editor), which has BYPASSRLS.
-- This bypasses any RLS on portal_acctivate_invoices / portal_acctivate_invoice_lines.
-- Return type matches the invoiced branch of the UNION ALL below.

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
    'invoiced'::text                                                          AS metric_type,
    pai.invoice_date::date                                                    AS transaction_date,
    EXTRACT(YEAR  FROM pai.invoice_date)::int                                 AS year,
    EXTRACT(MONTH FROM pai.invoice_date)::int                                 AS month_number,
    COALESCE(NULLIF(pai.customer_name::text, ''), pai.customer_id::text)     AS dealer_name,
    pai.customer_id::text                                                     AS customer_id,
    COALESCE(NULLIF(pai.sales_rep_name::text, ''), pai.sales_rep_id::text)   AS rep_name,
    pai.sales_rep_id::text                                                    AS rep_id,
    pail.product_id::text                                                     AS sku,
    pail.description::text                                                    AS description,
    pail.product_class::text                                                  AS brand_category,
    COALESCE(pail.line_amount::numeric, pail.invoice_detail_amount::numeric, 0) AS amount
  FROM public.portal_acctivate_invoices pai
  JOIN public.portal_acctivate_invoice_lines pail
    ON pail.guid_invoice::text = pai.guid_invoice::text
  WHERE pai.invoice_date IS NOT NULL
    AND NULLIF(TRIM(pail.product_id::text), '') IS NOT NULL
$$;

GRANT EXECUTE ON FUNCTION public.get_portal_invoiced_lines()
  TO anon, authenticated;


-- ── Step 2: recreate the view ─────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_portal_dealer_rep_reporting_lines AS

-- Salesperson lookup (deduped by GUIDSalesperson from dbo_Orders).
WITH order_salesperson_lookup AS (
  SELECT
    "GUIDSalesperson"::text                                   AS guid_salesperson,
    MAX(NULLIF(TRIM("SalespersonID"::text),   ''))            AS salesperson_id,
    MAX(NULLIF(TRIM("SalespersonName"::text), ''))            AS salesperson_name
  FROM public."dbo_Orders"
  WHERE "GUIDSalesperson" IS NOT NULL
  GROUP BY "GUIDSalesperson"::text
)

-- Bookings
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

-- Invoiced (via SECURITY DEFINER helper — bypasses RLS on invoice tables)
SELECT * FROM public.get_portal_invoiced_lines();

GRANT SELECT ON public.v_portal_dealer_rep_reporting_lines TO anon, authenticated;
