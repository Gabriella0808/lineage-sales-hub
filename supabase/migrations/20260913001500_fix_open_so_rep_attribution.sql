-- ══════════════════════════════════════════════════════════════════════════════
-- Root cause: v_portal_open_sales_order_line_facts resolved rep_id/rep_name
-- from portal_acctivate_orders.rep1 / .rep2, which are 100% NULL/blank for
-- every currently-open order line (0 of 3,287 rows populated, confirmed by
-- direct query). Every row fell through to rep_name = 'Unassigned', rep_id
-- = NULL, so get_open_sales_order_lines(p_group_by:='rep', ...) could never
-- match any real rep's entity_key - Open Sales Orders always returned 0
-- rows for every rep in Rep Reporting, regardless of which rep was
-- selected. The same rr (real_reps) join used rep1/rep2 for manager_id
-- resolution too, so p_manager_id scoping on this view was equally broken.
--
-- The correct, populated field was already sitting on the same table:
-- portal_acctivate_orders.guid_salesperson (99.9% populated, 3,283/3,287).
-- v_portal_bookings_line_facts and v_portal_dealer_rep_reporting_lines
-- already resolve rep via this exact field, through a lookup against
-- dbo_Orders."GUIDSalesperson" -> "SalespersonID"/"SalespersonName". This
-- migration adds the identical lookup (order_salesperson_lookup CTE, byte
-- -for-byte copy of the one in v_portal_dealer_rep_reporting_lines) and
-- prefers it for rep_id/rep_name/manager_id resolution, falling back to
-- the old rep1/rep2 logic only if the lookup misses.
--
-- Nothing else changes: qty/price/open_so_amount formula, dealer/customer
-- attribution, fulfillment_type, brand_category, date/workflow_status
-- filters, and every other column are byte-for-byte identical to the prior
-- version of this view.
--
-- Untouched: bookings, invoices, Dealer Reporting, Labor Day Promo, source
-- /sync tables, sync scripts, the 97-row Step 2 diagnostic (still open,
-- unrelated).
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_portal_open_sales_order_line_facts AS
WITH real_reps AS (
  SELECT
    sr.id           AS portal_rep_id,
    sr.name         AS canonical_rep_name,
    sr.acctivate_id AS canonical_rep_key,
    sr.manager_id
  FROM sales_reps sr
  WHERE NULLIF(TRIM(BOTH FROM sr.acctivate_id), '') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM territories t
      WHERE lower(TRIM(BOTH FROM t.name)) = lower(TRIM(BOTH FROM sr.name))
    )
),
order_salesperson_lookup AS (
  SELECT
    TRIM(BOTH '{}' FROM lower(o."GUIDSalesperson"::text))            AS guid_salesperson_norm,
    max(NULLIF(TRIM(BOTH FROM o."SalespersonID"::text), ''))         AS salesperson_id,
    max(NULLIF(TRIM(BOTH FROM o."SalespersonName"::text), ''))       AS salesperson_name
  FROM "dbo_Orders" o
  WHERE o."GUIDSalesperson" IS NOT NULL
  GROUP BY 1
),
lines AS (
  SELECT
    o.guid_order AS raw_guid_order,
    o.order_number,
    o.order_date::date AS order_date,
    o.requested_ship_date::date AS requested_ship_date,
    o.workflow_status,
    o.customer_id,
    dl.name AS dealer_lookup_name,
    COALESCE(
      NULLIF(osl.salesperson_id, ''),
      NULLIF(TRIM(BOTH FROM o.rep1), ''),
      NULLIF(TRIM(BOTH FROM o.rep2), ''),
      ''
    ) AS rep_id,
    COALESCE(
      NULLIF(osl.salesperson_name, ''),
      NULLIF(TRIM(BOTH FROM asr.name), ''),
      NULLIF(TRIM(BOTH FROM o.rep1), ''),
      NULLIF(TRIM(BOTH FROM o.rep2), ''),
      'Unassigned'
    ) AS rep_name,
    o.branch_id,
    CASE upper(COALESCE(o.branch_id, ''))
      WHEN 'MIXED'   THEN 'container'
      WHEN 'DIRECT'  THEN 'container'
      WHEN 'WHSALES' THEN 'warehouse'
      ELSE 'unclassified'
    END AS fulfillment_type,
    NULL::text AS warehouse,
    ol.product_id AS sku,
    ol.description,
    ol.product_class,
    ol.sales_category,
    CASE
      WHEN ol.sales_category = 'SW' THEN 'Sea Winds'
      WHEN ol.sales_category = ANY (ARRAY['FL', 'FINNLOU']) THEN 'Finn & Lou'
      WHEN upper(COALESCE(ol.sales_category, '')) = 'LUX' THEN 'Lux'
      WHEN ol.sales_category = 'ALLOW' OR COALESCE(ol.sales_category, '') = '' THEN 'ALLOW'
      ELSE NULL
    END AS brand_category,
    COALESCE(NULLIF(TRIM(BOTH FROM ol.qty_ordered), '')::numeric, 0) AS qty_ordered,
    COALESCE(NULLIF(TRIM(BOTH FROM ol.qty_shipped), '')::numeric, 0) AS qty_shipped,
    ol.qty_outstanding,
    ol.price,
    COALESCE(NULLIF(TRIM(BOTH FROM ol.line_discount_pct), '')::numeric, 0) AS line_discount_pct,
    rr.manager_id
  FROM portal_acctivate_orders o
  JOIN portal_acctivate_order_lines ol ON ol.guid_order = o.guid_order
  LEFT JOIN dealers dl ON dl.acctivate_id = o.customer_id
  LEFT JOIN order_salesperson_lookup osl
    ON osl.guid_salesperson_norm = TRIM(BOTH '{}' FROM lower(o.guid_salesperson))
  LEFT JOIN acctivate_sales_reps asr
    ON lower(TRIM(BOTH FROM asr.acctivate_id)) = lower(TRIM(BOTH FROM COALESCE(
         NULLIF(osl.salesperson_id, ''),
         NULLIF(TRIM(BOTH FROM o.rep1), ''),
         NULLIF(TRIM(BOTH FROM o.rep2), '')
       )))
  LEFT JOIN real_reps rr
    ON lower(TRIM(BOTH FROM rr.canonical_rep_key)) = lower(TRIM(BOTH FROM COALESCE(
         NULLIF(osl.salesperson_id, ''),
         NULLIF(TRIM(BOTH FROM o.rep1), ''),
         NULLIF(TRIM(BOTH FROM o.rep2), '')
       )))
  WHERE (o.workflow_status = ANY (ARRAY['Not Ready to Pick', 'Ready to Pick', 'Pick In Progress', 'Partially Invoiced']))
    AND (ol.line_cancelled = false OR ol.line_cancelled IS NULL)
    AND ol.product_id IS NOT NULL AND TRIM(BOTH FROM ol.product_id) <> ''
    AND ol.qty_outstanding > 0
)
SELECT
  lower(replace(replace(raw_guid_order, '{', ''), '}', '')) AS guid_order,
  order_number,
  order_date,
  requested_ship_date,
  customer_id,
  COALESCE(NULLIF(TRIM(BOTH FROM dealer_lookup_name), ''), customer_id) AS dealer_name,
  rep_id,
  rep_name,
  sku,
  description,
  product_class,
  sales_category,
  brand_category,
  branch_id,
  fulfillment_type,
  warehouse,
  qty_ordered,
  qty_shipped,
  qty_outstanding AS qty_open,
  price AS unit_price,
  line_discount_pct,
  round(price * qty_outstanding, 2) AS open_so_amount,
  manager_id,
  workflow_status
FROM lines;

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- 1. Rep attribution should now resolve for (almost) all open lines:
--    SELECT count(*) FILTER (WHERE rep_id IS NOT NULL AND rep_id <> '') AS has_rep_id,
--           count(*) FILTER (WHERE rep_name = 'Unassigned') AS still_unassigned,
--           count(*) AS total
--    FROM v_portal_open_sales_order_line_facts;
--
-- 2. Total open_so_amount across the whole view must be unchanged
--    ($2,522,203.66 as of 2026-09-10 - this migration touches rep_id/
--    rep_name/manager_id only, never amount/qty/price):
--    SELECT round(sum(open_so_amount)::numeric, 2) FROM v_portal_open_sales_order_line_facts;
--
-- 3. Dealer-grouped Open SO totals (customer_id-keyed) must be byte-for-
--    byte unchanged, since dealer attribution was never touched:
--    SELECT round(sum(open_so_amount)::numeric,2) FROM v_portal_open_sales_order_line_facts
--    WHERE customer_id = '<any previously-reconciled dealer acctivate_id>';
--
-- 4. Rep-grouped Open SO should now return real totals, e.g.:
--    SELECT count(*), round(sum(open_so_amount)::numeric,2)
--    FROM get_open_sales_order_lines(p_group_by:='rep', p_entity_key:='Brent',
--      p_customer_ids:=NULL, p_brand_cats:=NULL, p_skus:=NULL, p_rep_ids:=NULL,
--      p_manager_id:=NULL, p_limit:=100000, p_offset:=0);
-- ══════════════════════════════════════════════════════════════════════════════
