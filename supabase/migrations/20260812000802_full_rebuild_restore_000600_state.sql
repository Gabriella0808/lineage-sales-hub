-- Full explicit rebuild after 000800/000801 cascade damage.
--
-- Root cause: get_portal_invoiced_lines() is a SQL-language function that
-- directly references v_portal_invoice_line_facts.  PostgreSQL tracks this as a
-- hard dependency, so every DROP VIEW ... CASCADE in 000800 and 000801 also
-- silently dropped get_portal_invoiced_lines() and, by extension,
-- v_portal_dealer_rep_reporting_lines.  Migration 000801 only recreated the
-- view and mat view, leaving the function and reporting view missing.
--
-- This migration explicitly drops and recreates all four objects in dependency
-- order, restoring the exact production state from migrations 000600 + 000700:
--   1. v_portal_invoice_line_facts       (000600 logic — no acctivate_product_master)
--   2. mv_portal_monthly_invoiced_actuals
--   3. get_portal_invoiced_lines()       (000700 — includes invoice_number)
--   4. v_portal_dealer_rep_reporting_lines (000700 — bookings + invoiced UNION ALL)
--
-- acctivate_product_master is NOT used in production logic.
-- The diagnostic view v_portal_invoice_category_diagnostic (created in 000801)
-- is left in place for investigation; it is not part of any production chain.
--
-- No source data is modified.  Changes are view/function layer only.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Tear down everything cleanly (order matters: dependents first)
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW  IF EXISTS public.v_portal_dealer_rep_reporting_lines;
DROP FUNCTION IF EXISTS public.get_portal_invoiced_lines() CASCADE;
-- CASCADE above also drops mv_portal_monthly_invoiced_actuals if still present
DROP MATERIALIZED VIEW IF EXISTS public.mv_portal_monthly_invoiced_actuals;
DROP VIEW IF EXISTS public.v_portal_invoice_line_facts;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. v_portal_invoice_line_facts  (000600 logic — restored exactly)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE VIEW public.v_portal_invoice_line_facts AS
WITH pid_class_map AS MATERIALIZED (
  SELECT DISTINCT ON (product_id)
    product_id,
    product_class
  FROM public.portal_acctivate_invoice_lines
  WHERE product_class IS NOT NULL
  ORDER BY product_id, synced_at DESC
),
sol_map AS MATERIALIZED (
  SELECT DISTINCT ON (product_id)
    product_id,
    sales_category
  FROM public.stg_acctivate_order_lines_backfill
  WHERE sales_category IN ('SW', 'FINNLOU', 'LUX', 'ALLOW')
    AND product_id NOT ILIKE 'Discount%'
    AND product_id NOT ILIKE 'Samples%'
  ORDER BY product_id
),
deduped_pail AS MATERIALIZED (
  SELECT * FROM (
    SELECT
      pail.*,
      TRIM(REGEXP_REPLACE(
        REGEXP_REPLACE(pail.product_id, '^Drop Ship:DS-', '', 'i'),
        '\s*\(deleted\)\s*$', '', 'i'
      )) AS product_id_normalized,
      MAX(pail.synced_at) OVER (
        PARTITION BY
          pail.guid_invoice,
          pail.invoice_number,
          pail.invoice_date::date,
          pail.product_id,
          pail.description,
          COALESCE(pail.line_amount::numeric, 0),
          COALESCE(pail.invoice_detail_amount::numeric, 0),
          COALESCE(pail.product_class, ''),
          pail.line_number
      ) AS _max_synced
    FROM public.portal_acctivate_invoice_lines pail
  ) _t
  WHERE _t.synced_at = _t._max_synced
),
raw AS (
  SELECT
    pai.invoice_date::date                                                AS invoice_date,
    pai.invoice_number                                                    AS invoice_number,
    pai.customer_id                                                       AS customer_id,
    COALESCE(
      NULLIF(TRIM(dl.name::text),           ''),
      NULLIF(TRIM(pai.customer_name::text), ''),
      pai.customer_id::text
    )                                                                     AS dealer_name,
    COALESCE(
      NULLIF(TRIM(pai.sales_rep_name::text), ''),
      NULLIF(TRIM(pai.sales_rep_id::text),   ''),
      'Unassigned'
    )                                                                     AS salesperson_name,
    COALESCE(NULLIF(TRIM(pai.sales_rep_id::text), ''), '')                AS salesperson_id,
    pail.product_id                                                       AS product_id,
    pail.description                                                      AS description,
    COALESCE(
      public.resolve_invoice_sales_category(
        COALESCE(pail.product_class, pcm.product_class)::text,
        pail.product_id_normalized::text
      ),
      CASE WHEN sol.sales_category IN ('SW', 'FINNLOU', 'LUX', 'ALLOW')
           THEN sol.sales_category END
    )                                                                     AS sales_category,
    COALESCE(id2."Price", 0)::numeric                                     AS price,
    COALESCE(id2."QtyInvoiced", 0)::numeric                               AS qty_invoiced,
    COALESCE(id2."LineDiscountPct", 0)::numeric                           AS line_discount_pct,
    COALESCE(
      CASE
        WHEN id2."GUIDInvoiceDetail" IS NOT NULL
          AND id2."Price" IS NOT NULL
          AND id2."QtyInvoiced" IS NOT NULL
        THEN id2."Price" * id2."QtyInvoiced"
               * (1 - COALESCE(id2."LineDiscountPct", 0) / 100)
      END,
      NULLIF(pail.line_amount::numeric, 0),
      pail.invoice_detail_amount::numeric,
      0
    )::numeric                                                            AS net_invoice_amount
  FROM public.portal_acctivate_invoices pai
  JOIN deduped_pail pail
    ON pail.guid_invoice = pai.guid_invoice
    AND pail.invoice_date::date = pai.invoice_date::date   -- Aug duplicate/draft protection
  LEFT JOIN pid_class_map pcm
    ON pcm.product_id = pail.product_id_normalized
  LEFT JOIN sol_map sol
    ON sol.product_id = pail.product_id_normalized
  LEFT JOIN public."dbo_InvoiceDetail" id2
    ON id2."GUIDInvoiceDetail" = pail.guid_invoice_detail
  LEFT JOIN public.dealers dl
    ON dl.acctivate_id = pai.customer_id::text
  WHERE pai.invoice_date IS NOT NULL
)
SELECT
  invoice_date,
  invoice_number,
  customer_id,
  dealer_name,
  salesperson_name,
  salesperson_id,
  product_id,
  description,
  sales_category,
  CASE sales_category
    WHEN 'SW'      THEN 'Sea Winds'
    WHEN 'FINNLOU' THEN 'Finn & Louise'
    WHEN 'LUX'     THEN 'Lux Lighting'
    WHEN 'ALLOW'   THEN 'MISC'
  END                                                                     AS display_category,
  price,
  qty_invoiced,
  line_discount_pct,
  net_invoice_amount
FROM raw
WHERE sales_category IS NOT NULL;

GRANT SELECT ON public.v_portal_invoice_line_facts TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. mv_portal_monthly_invoiced_actuals
-- ─────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW public.mv_portal_monthly_invoiced_actuals AS
SELECT
  EXTRACT(YEAR  FROM invoice_date)::int         AS year,
  EXTRACT(MONTH FROM invoice_date)::int         AS month_number,
  COALESCE(SUM(net_invoice_amount), 0)::numeric AS invoiced_actual,
  0::numeric                                    AS invoiced_container,
  0::numeric                                    AS invoiced_warehouse,
  COUNT(DISTINCT invoice_number)::int           AS invoice_count
FROM public.v_portal_invoice_line_facts
GROUP BY 1, 2
ORDER BY 1, 2
WITH DATA;

CREATE UNIQUE INDEX ON public.mv_portal_monthly_invoiced_actuals (year, month_number);

GRANT SELECT ON public.mv_portal_monthly_invoiced_actuals
  TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. get_portal_invoiced_lines()  (000700 — SECURITY DEFINER, includes invoice_number)
-- ─────────────────────────────────────────────────────────────────────────────

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
-- 4. v_portal_dealer_rep_reporting_lines  (000700 — bookings + invoiced UNION ALL)
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
-- 1. Monthly totals — should match 000600 baseline:
SELECT TO_CHAR(invoice_date, 'YYYY-MM') AS month,
       ROUND(SUM(net_invoice_amount), 0) AS total
FROM public.v_portal_invoice_line_facts
WHERE invoice_date >= '2026-01-01'
GROUP BY 1 ORDER BY 1;
-- Expected:
--   Jan: 777,826   Feb: 829,627   Mar: 684,296
--   Apr: 637,695   May: 725,989   Jun: 845,987   Jul: 798,349

-- 2. Aug must still match exactly:
SELECT display_category, ROUND(SUM(net_invoice_amount), 2) AS total
FROM public.v_portal_invoice_line_facts
WHERE invoice_date >= '2026-08-01'
GROUP BY display_category ORDER BY total DESC;
--   Sea Winds 137,917.73  Finn & Louise 96,095.16
--   Lux Lighting 13,278.61  MISC -200.88

-- 3. Confirm function and reporting view are restored:
SELECT metric_type, COUNT(*) AS lines, COUNT(invoice_number) AS with_invoice_number,
       ROUND(SUM(amount), 0) AS total
FROM public.v_portal_dealer_rep_reporting_lines
WHERE transaction_date >= '2026-01-01' AND transaction_date < '2026-09-01'
GROUP BY metric_type;
*/
