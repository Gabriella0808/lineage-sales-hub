-- ══════════════════════════════════════════════════════════════════════════════
-- Add fulfillment_type to Dealer/Rep Reporting chain.
--
-- Surfaces fulfillment_type (container / warehouse / unclassified) in every
-- layer of the dealer/rep reporting stack so the table can show % Container
-- and % Warehouse per rep/dealer row.
--
-- Sources:
--   Invoiced : acctivate_invoice_lines_2026_direct.fulfillment_type (generated column)
--   Bookings : v_portal_bookings_line_facts.fulfillment_type (CASE expression added in 20260902000100)
--
-- Branch mapping (applied upstream in source tables):
--   MIXED / DIRECT → container
--   WHSALES        → warehouse
--   blank/null     → unclassified
--
-- New columns exposed by get_sales_reporting_grouped_rows():
--   container_amt  — sum(amount) where fulfillment_type = 'container', primary period
--   warehouse_amt  — sum(amount) where fulfillment_type = 'warehouse', primary period
--
-- Does NOT change: invoice totals, booking totals, Live KPI, Labor Day Promo.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── Drop dependency chain (outermost first) ──────────────────────────────────

DROP FUNCTION IF EXISTS public.get_sales_reporting_detail_lines(text,text,text,date,date,text[],text[],text[],text[],int,int,uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_sales_reporting_grouped_rows(text,text,date,date,date,date,text[],text[],text[],text[],uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_manager_reporting_monthly(uuid,text[],int[]) CASCADE;
DROP VIEW      IF EXISTS public.v_companywide_reporting_actuals CASCADE;
DROP VIEW      IF EXISTS public.v_portal_dealer_rep_reporting_lines CASCADE;
DROP FUNCTION  IF EXISTS public.get_portal_invoiced_lines() CASCADE;

-- ─── 1. v_portal_invoice_line_facts — add fulfillment_type ───────────────────
-- Uses d.fulfillment_type generated column from acctivate_invoice_lines_2026_direct
-- (corrected to DIRECT → 'container' in migration 20260902000200).

CREATE OR REPLACE VIEW public.v_portal_invoice_line_facts AS
SELECT
  d.invoice_date,
  d.invoice_number,
  d.customer_id,
  COALESCE(
    NULLIF(TRIM(dl.name::text), ''),
    d.customer_id
  )                                                         AS dealer_name,
  COALESCE(
    NULLIF(TRIM(asr.name::text),           ''),
    NULLIF(TRIM(pai.sales_rep_name::text), ''),
    NULLIF(TRIM(pai.sales_rep_id::text),   ''),
    NULLIF(TRIM(d.sales_rep_id),           ''),
    'Unassigned'
  )                                                         AS salesperson_name,
  COALESCE(NULLIF(TRIM(d.sales_rep_id), ''), '')            AS salesperson_id,
  d.product_id,
  d.description,
  d.product_sales_category                                  AS sales_category,
  CASE
    WHEN d.product_sales_category IN ('SW', 'FINNLOU')      THEN 'Sea Winds'
    WHEN d.product_sales_category = 'FL'                    THEN 'Finn & Lou'
    WHEN d.product_sales_category = 'FINNLOU'               THEN 'Finn & Lou'
    WHEN d.product_sales_category = 'LUX'                   THEN 'Lux'
    WHEN d.product_sales_category = 'ALLOW'                 THEN 'ALLOW'
    ELSE NULL
  END                                                       AS display_category,
  d.product_class::text                                     AS product_class,
  COALESCE(d.price,             0)::numeric                 AS price,
  COALESCE(d.qty_invoiced,      0)::numeric                 AS qty_invoiced,
  COALESCE(d.line_discount_pct, 0)::numeric                 AS line_discount_pct,
  COALESCE(d.formula_net_amount,0)::numeric                 AS net_invoice_amount,
  COALESCE(d.invoice_type, '')::text                        AS invoice_type,
  CASE COALESCE(d.invoice_type, '')
    WHEN 'C' THEN 'Credit Memo'
    ELSE COALESCE(d.invoice_type, '')
  END                                                       AS invoice_type_label,
  d.fulfillment_type::text                                  AS fulfillment_type
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

-- ─── 2. get_portal_invoiced_lines() — expose fulfillment_type ────────────────

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
  invoice_number   text,
  invoice_type     text,
  fulfillment_type text
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
    f.invoice_number,
    f.invoice_type,
    f.fulfillment_type
  FROM public.v_portal_invoice_line_facts f
$$;

GRANT EXECUTE ON FUNCTION public.get_portal_invoiced_lines()
  TO authenticated, anon, service_role;

-- ─── 3. v_portal_dealer_rep_reporting_lines — add fulfillment_type ────────────

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
  NULL::text                                                                     AS invoice_number,
  NULL::text                                                                     AS invoice_type,
  f.fulfillment_type::text                                                       AS fulfillment_type
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
  sku, description, brand_category, product_class, amount, invoice_number,
  invoice_type, fulfillment_type
FROM public.get_portal_invoiced_lines();

GRANT SELECT ON public.v_portal_dealer_rep_reporting_lines TO anon, authenticated;

-- ─── 4. v_companywide_reporting_actuals — pass fulfillment_type through ───────

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
  rl.invoice_type,
  rl.fulfillment_type,
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

-- ─── 5. get_manager_reporting_monthly() — unchanged; rebuild required ─────────

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

-- ─── 6. get_sales_reporting_grouped_rows() — add container_amt, warehouse_amt ─

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
  entity_label  text,
  primary_amt   numeric,
  primary_lines bigint,
  comp_amt      numeric,
  comp_lines    bigint,
  container_amt numeric,
  warehouse_amt numeric
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
        THEN COALESCE(NULLIF(TRIM(a.customer_id::text), ''), 'Unknown')
        ELSE COALESCE(NULLIF(TRIM(a.rep_id::text), ''), NULLIF(TRIM(a.rep_name::text), ''), 'Unassigned')
      END AS entity_key,
      CASE
        WHEN p_group_by = 'dealer'
        THEN COALESCE(NULLIF(TRIM(a.dealer_name::text), ''), a.customer_id::text, 'Unknown')
        ELSE COALESCE(NULLIF(TRIM(a.rep_id::text), ''), NULLIF(TRIM(a.rep_name::text), ''), 'Unassigned')
      END AS entity_label,
      a.amount,
      a.fulfillment_type,
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
    MAX(entity_label)::text                                                                      AS entity_label,
    COALESCE(SUM(amount) FILTER (WHERE transaction_date BETWEEN p_from AND p_to), 0)::numeric   AS primary_amt,
    COALESCE(COUNT(*)    FILTER (WHERE transaction_date BETWEEN p_from AND p_to), 0)::bigint    AS primary_lines,
    COALESCE(SUM(amount) FILTER (WHERE p_comp_from IS NOT NULL AND transaction_date BETWEEN p_comp_from AND p_comp_to), 0)::numeric AS comp_amt,
    COALESCE(COUNT(*)    FILTER (WHERE p_comp_from IS NOT NULL AND transaction_date BETWEEN p_comp_from AND p_comp_to), 0)::bigint  AS comp_lines,
    COALESCE(SUM(amount) FILTER (WHERE transaction_date BETWEEN p_from AND p_to AND fulfillment_type = 'container'), 0)::numeric   AS container_amt,
    COALESCE(SUM(amount) FILTER (WHERE transaction_date BETWEEN p_from AND p_to AND fulfillment_type = 'warehouse'), 0)::numeric   AS warehouse_amt
  FROM src
  GROUP BY entity_key
  HAVING
    COALESCE(SUM(amount) FILTER (WHERE transaction_date BETWEEN p_from AND p_to), 0) != 0
    OR COALESCE(SUM(amount) FILTER (WHERE p_comp_from IS NOT NULL AND transaction_date BETWEEN p_comp_from AND p_comp_to), 0) != 0
  ORDER BY 3 DESC NULLS LAST
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_reporting_grouped_rows(
  text, text, date, date, date, date, text[], text[], text[], text[], uuid
) TO authenticated, anon, service_role;

-- ─── 7. get_sales_reporting_detail_lines() — expose fulfillment_type ──────────

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
  amount           numeric,
  invoice_type     text,
  fulfillment_type text
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
    a.amount::numeric,
    a.invoice_type::text,
    a.fulfillment_type::text
  FROM public.v_companywide_reporting_actuals a
  WHERE a.metric_type = p_metric
    AND a.transaction_date BETWEEN p_from AND p_to
    AND (
      (p_group_by = 'dealer'
       AND COALESCE(NULLIF(TRIM(a.customer_id::text), ''), 'Unknown') = p_entity_key)
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

NOTIFY pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION — run after applying in Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Rep-level invoice split (validates fulfillment_type in view):
-- SELECT rep_name, rep_id,
--   round(sum(amount),2) AS primary_total,
--   round(sum(case when fulfillment_type='container' then amount else 0 end),2) AS container_amount,
--   round(sum(case when fulfillment_type='warehouse' then amount else 0 end),2) AS warehouse_amount,
--   round(sum(case when fulfillment_type='container' then amount else 0 end)/nullif(sum(amount),0)*100,1) AS container_pct,
--   round(sum(case when fulfillment_type='warehouse' then amount else 0 end)/nullif(sum(amount),0)*100,1) AS warehouse_pct
-- FROM public.v_portal_dealer_rep_reporting_lines
-- WHERE metric_type='invoiced' AND transaction_date BETWEEN '2026-01-01' AND '2026-09-01'
-- GROUP BY rep_name, rep_id ORDER BY primary_total DESC;

-- 2. Dealer-level booking split:
-- SELECT dealer_name, customer_id,
--   round(sum(amount),2) AS primary_total,
--   round(sum(case when fulfillment_type='container' then amount else 0 end)/nullif(sum(amount),0)*100,1) AS container_pct,
--   round(sum(case when fulfillment_type='warehouse' then amount else 0 end)/nullif(sum(amount),0)*100,1) AS warehouse_pct
-- FROM public.v_portal_dealer_rep_reporting_lines
-- WHERE metric_type='bookings' AND transaction_date BETWEEN '2026-01-01' AND '2026-09-01'
-- GROUP BY dealer_name, customer_id ORDER BY primary_total DESC;
