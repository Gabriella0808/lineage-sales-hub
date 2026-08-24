-- FINNLOU is an existing/alternate Acctivate SalesCategory code for Finn & Lou
-- and must be included alongside FL.  The previous migration (000200) removed it
-- which caused ~$239k of Finn & Lou invoicing to drop out of the totals.
--
-- Correct whitelist: NULL, SW, ALLOW, FL, FINNLOU, LUX
-- Still excluded:    MISC, FREIGHT, FREIGHTO, TARIFF, SALESTAX, QC, QCFACTOR, QCFREIGH
--
-- Both FL and FINNLOU normalise to display_category = 'Finn & Lou'.

-- ─────────────────────────────────────────────────────────────────────────────
-- Prerequisites from 20260824000100 (may not have been applied to live DB)
-- Add product_class to bookings staging table and bookings line facts view.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.portal_acctivate_order_lines
  ADD COLUMN IF NOT EXISTS product_class text;

CREATE OR REPLACE VIEW public.v_portal_bookings_line_facts AS
SELECT
  o.guid_order::text                                            AS guid_order,
  o.guid_customer::text                                         AS guid_customer,
  o.guid_salesperson::text                                      AS guid_salesperson,
  date(o.order_date)                                            AS booking_date,
  o.sold_to_name::text                                          AS dealer_name,
  o.rep1::text                                                  AS rep1,
  o.rep2::text                                                  AS rep2,
  l.product_id::text                                            AS sku,
  l.description::text                                           AS description,
  CASE l.sales_category
    WHEN 'SW'      THEN 'Sea Winds'
    WHEN 'FINNLOU' THEN 'Finn & Lou'
    WHEN 'LUX'     THEN 'Lux'
    WHEN 'ALLOW'   THEN 'MISC'
    ELSE l.sales_category
  END::text                                                     AS brand_category,
  CASE
    WHEN COALESCE(NULLIF(l.original_price, '')::numeric, 0) <> 0
    THEN
        COALESCE(l.qty_ordered::numeric,      0)
      * NULLIF(l.original_price, '')::numeric
      * (1.0 - COALESCE(l.line_discount_pct::numeric, 0) / 100.0)
    ELSE
        COALESCE(l.amount::numeric,           0)
      - COALESCE(l.tariff_amount::numeric,    0)
      - COALESCE(l.freight_amount::numeric,   0)
  END::numeric                                                  AS net_booking_amount,
  l.product_class::text                                         AS product_class
FROM public.portal_acctivate_orders o
JOIN public.portal_acctivate_order_lines l
  ON l.guid_order = o.guid_order
WHERE COALESCE(l.line_cancelled, false) = false
  AND l.sales_category IN ('SW', 'FINNLOU', 'LUX', 'HOSP', 'ALLOW', 'MISC');

GRANT SELECT ON public.v_portal_bookings_line_facts TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tear down dependency chain (outermost first)
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION  IF EXISTS public.get_sales_reporting_detail_lines(text,text,text,date,date,text[],text[],text[],text[],int,int,uuid) CASCADE;
DROP FUNCTION  IF EXISTS public.get_sales_reporting_grouped_rows(text,text,date,date,date,date,text[],text[],text[],text[],uuid) CASCADE;
DROP FUNCTION  IF EXISTS public.get_manager_reporting_monthly(uuid,text[],int[]) CASCADE;
DROP VIEW      IF EXISTS public.v_companywide_reporting_actuals;
DROP VIEW      IF EXISTS public.v_portal_dealer_rep_reporting_lines;
DROP FUNCTION  IF EXISTS public.get_portal_invoiced_lines() CASCADE;
-- v_portal_clearance_sales_analytics depends on v_portal_invoice_line_facts in the
-- live DB (was recreated independently in a later migration that may not have run).
-- Drop it here; it is recreated below using the correct base-table-direct definition.
DROP VIEW      IF EXISTS public.v_portal_clearance_sales_analytics;
DROP VIEW      IF EXISTS public.v_portal_invoice_line_facts;
DROP MATERIALIZED VIEW IF EXISTS public.mv_portal_monthly_invoiced_actuals;

-- ─────────────────────────────────────────────────────────────────────────────
-- v_portal_invoice_line_facts
-- ─────────────────────────────────────────────────────────────────────────────

CREATE VIEW public.v_portal_invoice_line_facts AS
SELECT
  d.invoice_date,
  d.invoice_number,
  d.customer_id,
  COALESCE(
    NULLIF(TRIM(dl.name::text), ''),
    d.customer_id
  )                                                       AS dealer_name,
  COALESCE(
    NULLIF(TRIM(asr.name::text),           ''),
    NULLIF(TRIM(pai.sales_rep_name::text), ''),
    NULLIF(TRIM(pai.sales_rep_id::text),   ''),
    NULLIF(TRIM(d.sales_rep_id),           ''),
    'Unassigned'
  )                                                       AS salesperson_name,
  COALESCE(NULLIF(TRIM(d.sales_rep_id), ''), '')         AS salesperson_id,
  d.product_id,
  d.description,
  d.product_sales_category                               AS sales_category,
  CASE d.product_sales_category
    WHEN 'SW'      THEN 'Sea Winds'
    WHEN 'FL'      THEN 'Finn & Lou'
    WHEN 'FINNLOU' THEN 'Finn & Lou'
    WHEN 'LUX'     THEN 'Lux'
    WHEN 'ALLOW'   THEN 'ALLOW'
    ELSE NULL
  END                                                     AS display_category,
  d.product_class::text                                   AS product_class,
  COALESCE(d.price,             0)::numeric               AS price,
  COALESCE(d.qty_invoiced,      0)::numeric               AS qty_invoiced,
  COALESCE(d.line_discount_pct, 0)::numeric               AS line_discount_pct,
  COALESCE(d.formula_net_amount,0)::numeric               AS net_invoice_amount
FROM public.acctivate_invoice_lines_2026_direct d
LEFT JOIN public.dealers dl
  ON dl.acctivate_id = d.customer_id
LEFT JOIN public.portal_acctivate_invoices pai
  ON pai.guid_invoice::text = d.guid_invoice
LEFT JOIN public.acctivate_sales_reps asr
  ON LOWER(TRIM(asr.acctivate_id)) = LOWER(TRIM(d.sales_rep_id))
WHERE d.invoice_date IS NOT NULL
  AND d.invoice_date >= '2026-01-01'
  AND COALESCE(d.product_sales_category, 'NULL') IN ('NULL', 'SW', 'ALLOW', 'FL', 'FINNLOU', 'LUX');

GRANT SELECT ON public.v_portal_invoice_line_facts TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- mv_portal_monthly_invoiced_actuals
-- ─────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW public.mv_portal_monthly_invoiced_actuals AS

WITH jan_jul_branch AS (
  SELECT
    d.year,
    d.month_number,
    SUM(CASE
      WHEN d.branch_id = 'MIXED'
       AND COALESCE(d.product_sales_category, 'NULL') IN ('NULL', 'SW', 'ALLOW', 'FL', 'FINNLOU', 'LUX')
      THEN COALESCE(d.formula_net_amount, 0)::numeric ELSE 0
    END) AS invoiced_container,
    SUM(CASE
      WHEN d.branch_id = 'WHSALES'
       AND COALESCE(d.product_sales_category, 'NULL') IN ('NULL', 'SW', 'ALLOW', 'FL', 'FINNLOU', 'LUX')
      THEN COALESCE(d.formula_net_amount, 0)::numeric ELSE 0
    END) AS invoiced_warehouse,
    SUM(CASE
      WHEN (d.branch_id NOT IN ('MIXED', 'WHSALES') OR d.branch_id IS NULL)
       AND COALESCE(d.product_sales_category, 'NULL') IN ('NULL', 'SW', 'ALLOW', 'FL', 'FINNLOU', 'LUX')
      THEN COALESCE(d.formula_net_amount, 0)::numeric ELSE 0
    END) AS invoiced_unclassified
  FROM public.acctivate_invoice_lines_2026_direct d
  WHERE d.invoice_date BETWEEN '2026-01-01' AND '2026-07-31'
  GROUP BY d.year, d.month_number
),

jan_jul_count AS (
  SELECT
    year,
    month_number,
    COUNT(DISTINCT invoice_number)::int AS invoice_count
  FROM public.acctivate_invoice_lines_2026_direct
  WHERE invoice_date BETWEEN '2026-01-01' AND '2026-07-31'
    AND COALESCE(product_sales_category, 'NULL') IN ('NULL', 'SW', 'ALLOW', 'FL', 'FINNLOU', 'LUX')
  GROUP BY year, month_number
),

aug_on AS (
  SELECT
    d.year,
    d.month_number,
    SUM(CASE
      WHEN COALESCE(d.product_sales_category, 'NULL') IN ('NULL', 'SW', 'ALLOW', 'FL', 'FINNLOU', 'LUX')
      THEN COALESCE(d.formula_net_amount, 0)::numeric ELSE 0
    END) AS invoiced_actual,
    SUM(CASE
      WHEN d.branch_id = 'MIXED'
       AND COALESCE(d.product_sales_category, 'NULL') IN ('NULL', 'SW', 'ALLOW', 'FL', 'FINNLOU', 'LUX')
      THEN COALESCE(d.formula_net_amount, 0)::numeric ELSE 0
    END) AS invoiced_container,
    SUM(CASE
      WHEN d.branch_id = 'WHSALES'
       AND COALESCE(d.product_sales_category, 'NULL') IN ('NULL', 'SW', 'ALLOW', 'FL', 'FINNLOU', 'LUX')
      THEN COALESCE(d.formula_net_amount, 0)::numeric ELSE 0
    END) AS invoiced_warehouse,
    SUM(CASE
      WHEN (d.branch_id NOT IN ('MIXED', 'WHSALES') OR d.branch_id IS NULL)
       AND COALESCE(d.product_sales_category, 'NULL') IN ('NULL', 'SW', 'ALLOW', 'FL', 'FINNLOU', 'LUX')
      THEN COALESCE(d.formula_net_amount, 0)::numeric ELSE 0
    END) AS invoiced_unclassified,
    COUNT(DISTINCT d.invoice_number)::int AS invoice_count
  FROM public.acctivate_invoice_lines_2026_direct d
  WHERE d.invoice_date >= '2026-08-01'
  GROUP BY d.year, d.month_number
)

SELECT
  k.year,
  k.month_number,
  k.invoiced_actual,
  COALESCE(b.invoiced_container,    0)::numeric AS invoiced_container,
  COALESCE(b.invoiced_warehouse,    0)::numeric AS invoiced_warehouse,
  COALESCE(b.invoiced_unclassified, 0)::numeric AS invoiced_unclassified,
  COALESCE(cnt.invoice_count,       0)::int     AS invoice_count
FROM public.acctivate_kpi_monthly_invoiced_2026 k
LEFT JOIN jan_jul_branch b   USING (year, month_number)
LEFT JOIN jan_jul_count  cnt USING (year, month_number)
WHERE k.year = 2026
  AND k.month_number BETWEEN 1 AND 7

UNION ALL

SELECT
  year,
  month_number,
  invoiced_actual,
  invoiced_container,
  invoiced_warehouse,
  invoiced_unclassified,
  invoice_count
FROM aug_on

ORDER BY 1, 2
WITH DATA;

CREATE UNIQUE INDEX ON public.mv_portal_monthly_invoiced_actuals (year, month_number);

GRANT SELECT ON public.mv_portal_monthly_invoiced_actuals
  TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_portal_invoiced_lines()
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
  product_class    text,
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
    f.dealer_name,
    f.customer_id,
    f.salesperson_name                            AS rep_name,
    f.salesperson_id                              AS rep_id,
    f.product_id                                  AS sku,
    f.description,
    f.display_category                            AS brand_category,
    f.product_class,
    f.net_invoice_amount                          AS amount,
    f.invoice_number
  FROM public.v_portal_invoice_line_facts f
$$;

GRANT EXECUTE ON FUNCTION public.get_portal_invoiced_lines()
  TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- v_portal_dealer_rep_reporting_lines
-- ─────────────────────────────────────────────────────────────────────────────

CREATE VIEW public.v_portal_dealer_rep_reporting_lines AS

WITH order_salesperson_lookup AS (
  SELECT
    TRIM(BOTH '{}' FROM LOWER("GUIDSalesperson"::text))   AS guid_salesperson_norm,
    MAX(NULLIF(TRIM("SalespersonID"::text),   ''))         AS salesperson_id,
    MAX(NULLIF(TRIM("SalespersonName"::text), ''))         AS salesperson_name
  FROM public."dbo_Orders"
  WHERE "GUIDSalesperson" IS NOT NULL
  GROUP BY TRIM(BOTH '{}' FROM LOWER("GUIDSalesperson"::text))
),
customer_lookup AS (
  SELECT
    LOWER("GUIDCustomer"::text)                            AS guid_customer_norm,
    MAX(NULLIF(TRIM("CustomerID"::text), ''))               AS customer_id
  FROM public."dbo_Orders"
  WHERE "GUIDCustomer" IS NOT NULL
  GROUP BY LOWER("GUIDCustomer"::text)
),
unique_dealer_name_lookup AS (
  SELECT
    LOWER(TRIM(name))  AS name_norm,
    MIN(acctivate_id)  AS acctivate_id
  FROM public.dealers
  GROUP BY LOWER(TRIM(name))
  HAVING COUNT(*) = 1
)

SELECT
  'bookings'::text                                                               AS metric_type,
  f.booking_date::date                                                           AS transaction_date,
  EXTRACT(YEAR  FROM f.booking_date)::int                                        AS year,
  EXTRACT(MONTH FROM f.booking_date)::int                                        AS month_number,
  COALESCE(f.dealer_name::text, o."CustomerID"::text, cl.customer_id,
           udl.acctivate_id)                                                     AS dealer_name,
  COALESCE(o."CustomerID"::text, cl.customer_id, udl.acctivate_id)              AS customer_id,
  COALESCE(
    osl.salesperson_name,
    NULLIF(o."SalespersonName"::text, ''),
    NULLIF(o."_Rep1"::text,           ''),
    NULLIF(o."_Rep2"::text,           ''),
    NULLIF(f.rep1::text,              ''),
    NULLIF(f.rep2::text,              ''),
    'Unassigned'
  )::text                                                                        AS rep_name,
  COALESCE(NULLIF(osl.salesperson_id, ''), NULLIF(f.rep1::text, ''),
           f.guid_salesperson::text)::text                                       AS rep_id,
  f.sku::text                                                                    AS sku,
  f.description::text                                                            AS description,
  f.brand_category::text                                                         AS brand_category,
  f.product_class::text                                                          AS product_class,
  f.net_booking_amount::numeric                                                  AS amount,
  NULL::text                                                                     AS invoice_number
FROM public.v_portal_bookings_line_facts f
LEFT JOIN public."dbo_Orders" o
  ON TRIM(BOTH '{}' FROM LOWER(o."GUIDOrder"::text)) = LOWER(f.guid_order)
LEFT JOIN order_salesperson_lookup osl
  ON osl.guid_salesperson_norm = TRIM(BOTH '{}' FROM LOWER(f.guid_salesperson::text))
LEFT JOIN customer_lookup cl
  ON cl.guid_customer_norm = LOWER(f.guid_customer)
LEFT JOIN unique_dealer_name_lookup udl
  ON udl.name_norm = LOWER(TRIM(f.dealer_name))
WHERE f.booking_date IS NOT NULL

UNION ALL

SELECT
  metric_type, transaction_date, year, month_number,
  dealer_name, customer_id, rep_name, rep_id,
  sku, description, brand_category, product_class, amount, invoice_number
FROM public.get_portal_invoiced_lines();

GRANT SELECT ON public.v_portal_dealer_rep_reporting_lines TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- v_companywide_reporting_actuals
-- ─────────────────────────────────────────────────────────────────────────────

CREATE VIEW public.v_companywide_reporting_actuals AS
WITH real_reps AS (
  SELECT
    sr.id           AS portal_rep_id,
    sr.name         AS canonical_rep_name,
    sr.acctivate_id AS canonical_rep_key,
    sr.manager_id
  FROM public.sales_reps sr
  WHERE
    NULLIF(TRIM(sr.acctivate_id), '') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.territories t
      WHERE LOWER(TRIM(t.name)) = LOWER(TRIM(sr.name))
    )
)
SELECT
  rl.metric_type,
  rl.transaction_date,
  rl.year,
  rl.month_number,
  rl.dealer_name,
  rl.customer_id,
  rl.rep_id,
  rl.rep_name,
  rl.sku,
  rl.description,
  rl.brand_category,
  rl.product_class,
  rl.amount,
  rl.invoice_number,
  rr.portal_rep_id,
  rr.canonical_rep_name,
  rr.canonical_rep_key,
  rr.manager_id,
  m.name AS manager_name
FROM public.v_portal_dealer_rep_reporting_lines rl
LEFT JOIN real_reps rr
  ON  NULLIF(TRIM(rl.rep_id), '') IS NOT NULL
  AND LOWER(TRIM(rr.canonical_rep_key)) = LOWER(TRIM(rl.rep_id))
LEFT JOIN public.managers m ON m.id = rr.manager_id;

GRANT SELECT ON public.v_companywide_reporting_actuals TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_manager_reporting_monthly()
-- ─────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION public.get_manager_reporting_monthly(
  p_manager_id uuid     DEFAULT NULL,
  p_rep_ac_ids text[]   DEFAULT NULL,
  p_years      int[]    DEFAULT NULL
)
RETURNS TABLE (
  metric_type  text,
  year         int,
  month_number int,
  total_amount numeric,
  row_count    bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.metric_type,
    a.year,
    a.month_number,
    COALESCE(SUM(a.amount), 0) AS total_amount,
    COUNT(*)                   AS row_count
  FROM public.v_companywide_reporting_actuals a
  WHERE
    (p_years IS NULL OR a.year = ANY(p_years))
    AND (
      (p_rep_ac_ids IS NOT NULL
        AND NULLIF(TRIM(a.rep_id), '') IS NOT NULL
        AND LOWER(TRIM(a.rep_id)) = ANY(
          SELECT LOWER(TRIM(x)) FROM unnest(p_rep_ac_ids) AS x
          WHERE NULLIF(TRIM(x), '') IS NOT NULL
        ))
      OR
      (p_rep_ac_ids IS NULL
        AND (p_manager_id IS NULL OR a.manager_id = p_manager_id))
    )
  GROUP BY 1, 2, 3
  ORDER BY 1, 2, 3;
$$;

GRANT EXECUTE ON FUNCTION public.get_manager_reporting_monthly(uuid, text[], int[])
  TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_sales_reporting_grouped_rows()
-- ─────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION public.get_sales_reporting_grouped_rows(
  p_metric       text,
  p_group_by     text,
  p_from         date,
  p_to           date,
  p_comp_from    date    DEFAULT NULL,
  p_comp_to      date    DEFAULT NULL,
  p_customer_ids text[]  DEFAULT NULL,
  p_brand_cats   text[]  DEFAULT NULL,
  p_skus         text[]  DEFAULT NULL,
  p_rep_ids      text[]  DEFAULT NULL,
  p_manager_id   uuid    DEFAULT NULL
)
RETURNS TABLE (
  entity_key    text,
  primary_amt   numeric,
  primary_lines bigint,
  comp_amt      numeric,
  comp_lines    bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH src AS (
    SELECT
      CASE
        WHEN p_group_by = 'dealer'
        THEN COALESCE(NULLIF(TRIM(a.dealer_name::text), ''), a.customer_id::text, 'Unknown')
        ELSE COALESCE(NULLIF(TRIM(a.rep_id::text), ''), NULLIF(TRIM(a.rep_name::text), ''), 'Unassigned')
      END         AS entity_key,
      a.amount,
      a.transaction_date
    FROM public.v_companywide_reporting_actuals a
    WHERE a.metric_type = p_metric
      AND a.transaction_date >= LEAST(p_from, COALESCE(p_comp_from, p_from))
      AND a.transaction_date <= GREATEST(p_to, COALESCE(p_comp_to, p_to))
      AND (p_manager_id IS NULL OR a.manager_id = p_manager_id)
      AND (p_customer_ids IS NULL OR lower(a.customer_id::text) = ANY(p_customer_ids))
      AND (p_brand_cats IS NULL
           OR array_length(p_brand_cats, 1) IS NULL
           OR COALESCE(a.brand_category,
                CASE WHEN p_metric = 'invoiced' THEN 'Historical Invoice' ELSE '' END
              ) = ANY(p_brand_cats))
      AND (p_skus IS NULL OR array_length(p_skus, 1) IS NULL OR a.sku = ANY(p_skus))
      AND (p_rep_ids IS NULL
           OR (NULLIF(TRIM(a.rep_id::text), '') IS NOT NULL
               AND lower(TRIM(a.rep_id::text)) = ANY(p_rep_ids)))
  )
  SELECT
    entity_key,
    COALESCE(SUM(amount) FILTER (WHERE transaction_date BETWEEN p_from AND p_to), 0)::numeric AS primary_amt,
    COALESCE(COUNT(*) FILTER (WHERE transaction_date BETWEEN p_from AND p_to), 0)::bigint AS primary_lines,
    COALESCE(SUM(amount) FILTER (WHERE p_comp_from IS NOT NULL AND transaction_date BETWEEN p_comp_from AND p_comp_to), 0)::numeric AS comp_amt,
    COALESCE(COUNT(*) FILTER (WHERE p_comp_from IS NOT NULL AND transaction_date BETWEEN p_comp_from AND p_comp_to), 0)::bigint AS comp_lines
  FROM src
  GROUP BY entity_key
  HAVING
    COALESCE(SUM(amount) FILTER (WHERE transaction_date BETWEEN p_from AND p_to), 0) != 0
    OR COALESCE(SUM(amount) FILTER (WHERE p_comp_from IS NOT NULL AND transaction_date BETWEEN p_comp_from AND p_comp_to), 0) != 0
  ORDER BY 2 DESC NULLS LAST
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_reporting_grouped_rows(
  text, text, date, date, date, date, text[], text[], text[], text[], uuid
) TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_sales_reporting_detail_lines()
-- ─────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION public.get_sales_reporting_detail_lines(
  p_metric       text,
  p_group_by     text,
  p_entity_key   text,
  p_from         date,
  p_to           date,
  p_customer_ids text[]  DEFAULT NULL,
  p_brand_cats   text[]  DEFAULT NULL,
  p_skus         text[]  DEFAULT NULL,
  p_rep_ids      text[]  DEFAULT NULL,
  p_limit        int     DEFAULT 200,
  p_offset       int     DEFAULT 0,
  p_manager_id   uuid    DEFAULT NULL
)
RETURNS TABLE (
  transaction_date date,
  invoice_number   text,
  dealer_name      text,
  rep_name         text,
  rep_id           text,
  customer_id      text,
  sku              text,
  description      text,
  brand_category   text,
  product_class    text,
  amount           numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    a.transaction_date,
    a.invoice_number::text,
    a.dealer_name::text,
    a.rep_name::text,
    a.rep_id::text,
    a.customer_id::text,
    a.sku::text,
    a.description::text,
    a.brand_category::text,
    a.product_class::text,
    a.amount::numeric
  FROM public.v_companywide_reporting_actuals a
  WHERE a.metric_type = p_metric
    AND a.transaction_date BETWEEN p_from AND p_to
    AND (
      (p_group_by = 'dealer'
       AND COALESCE(NULLIF(TRIM(a.dealer_name::text), ''), a.customer_id::text, 'Unknown') = p_entity_key)
      OR
      (p_group_by = 'rep'
       AND COALESCE(NULLIF(TRIM(a.rep_id::text), ''), NULLIF(TRIM(a.rep_name::text), ''), 'Unassigned') = p_entity_key)
    )
    AND (p_manager_id IS NULL OR a.manager_id = p_manager_id)
    AND (p_customer_ids IS NULL OR lower(a.customer_id::text) = ANY(p_customer_ids))
    AND (p_brand_cats IS NULL
         OR array_length(p_brand_cats, 1) IS NULL
         OR COALESCE(a.brand_category,
              CASE WHEN p_metric = 'invoiced' THEN 'Historical Invoice' ELSE '' END
            ) = ANY(p_brand_cats))
    AND (p_skus IS NULL OR array_length(p_skus, 1) IS NULL OR a.sku = ANY(p_skus))
    AND (p_rep_ids IS NULL
         OR (NULLIF(TRIM(a.rep_id::text), '') IS NOT NULL
             AND lower(TRIM(a.rep_id::text)) = ANY(p_rep_ids)))
  ORDER BY a.transaction_date DESC, a.invoice_number NULLS LAST
  LIMIT  p_limit
  OFFSET p_offset
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_reporting_detail_lines(
  text, text, text, date, date, text[], text[], text[], text[], int, int, uuid
) TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- v_portal_clearance_sales_analytics
-- Reads directly from acctivate_invoice_lines_2026_direct so it is independent
-- of v_portal_invoice_line_facts (avoids the dependency that broke previous runs).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE VIEW public.v_portal_clearance_sales_analytics AS
SELECT
  d.invoice_date                                                    AS sale_date,
  (d.invoice_date
    + (((5 - EXTRACT(DOW FROM d.invoice_date)::int + 7) % 7))::int
    - 6
  )                                                                 AS week_start,
  (d.invoice_date
    + (((5 - EXTRACT(DOW FROM d.invoice_date)::int + 7) % 7))::int
  )                                                                 AS week_end,
  COALESCE(
    NULLIF(TRIM(asr.name::text),           ''),
    NULLIF(TRIM(pai.sales_rep_name::text), ''),
    NULLIF(TRIM(pai.sales_rep_id::text),   ''),
    NULLIF(TRIM(d.sales_rep_id),           ''),
    'Unassigned'
  )                                                                 AS rep_name,
  COALESCE(NULLIF(TRIM(d.sales_rep_id), ''), '')                   AS rep_id,
  d.product_id                                                      AS sku,
  d.description                                                     AS product,
  COALESCE(disc.product_class, d.product_sales_category)           AS product_class,
  COALESCE(d.qty_invoiced,      0)::numeric                        AS quantity_sold,
  COALESCE(d.formula_net_amount, 0)::numeric                       AS sales_amount,
  d.invoice_number,
  disc.synced_at
FROM public.acctivate_invoice_lines_2026_direct d
INNER JOIN (
  SELECT
    product_id,
    MAX(product_class) AS product_class,
    MAX(synced_at)     AS synced_at
  FROM public.stg_acctivate_discontinued_inventory
  GROUP BY product_id
) disc ON disc.product_id = d.product_id
LEFT JOIN public.portal_acctivate_invoices pai
  ON pai.guid_invoice::text = d.guid_invoice
LEFT JOIN public.acctivate_sales_reps asr
  ON LOWER(TRIM(asr.acctivate_id)) = LOWER(TRIM(d.sales_rep_id))
WHERE d.invoice_date IS NOT NULL
  AND d.invoice_date >= '2026-01-01'
  AND COALESCE(d.product_sales_category, 'NULL') IN ('NULL', 'SW', 'ALLOW', 'FL', 'FINNLOU', 'LUX');

GRANT SELECT ON public.v_portal_clearance_sales_analytics
  TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Refresh and reload
-- ─────────────────────────────────────────────────────────────────────────────

SELECT public.refresh_mv_portal_invoiced();

NOTIFY pgrst, 'reload schema';
