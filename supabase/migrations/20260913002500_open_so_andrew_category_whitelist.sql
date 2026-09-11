-- ══════════════════════════════════════════════════════════════════════════════
-- Align Open Sales Orders category filter to Andrew's approved query:
-- replace the old EXCLUDE-list (TARIFF, SURCHARGE, FREIGHTO) with an
-- INCLUDE-list — NULL/blank SalesCategory, ALLOW, FINNLOU, LUX, SW — so
-- MISC, SALESTAX, HOSP, CCFEE, QC, and anything else outside that list is
-- now excluded too, matching Andrew's WHERE clause exactly:
--   (od.SalesCategory IS NULL OR od.SalesCategory IN ('ALLOW','FINNLOU','LUX','SW'))
--
-- Discount formula was already correct (open_so_amount = price *
-- qty_outstanding * (1 - line_discount_pct/100), added in
-- 20260913002400) - unchanged here.
--
-- DIAGNOSTIC: NULL line_discount_pct (requested before deciding null
-- handling) - 12 of 3,322 currently-open lines (0.36%), $5,013.00 of
-- $2,548,828.28 total gross (0.2%). Immaterial. Andrew's raw SQL Server
-- query does not ISNULL/COALESCE LineDiscountPct, so SUM() would silently
-- drop these 12 lines' dollar contribution entirely (NULL arithmetic
-- propagates, and SUM ignores NULL rows) while still counting their
-- quantity in the qty SUM - a SQL Server NULL-propagation quirk, not a
-- deliberate business rule. Given the amount is immaterial and dropping
-- known revenue silently is virtually never intentional, this migration
-- keeps COALESCE(line_discount_pct, 0) (treat NULL discount as 0%,
-- i.e. full price) rather than replicating that quirk. Flagged for
-- override if the exact SQL Server behavior is specifically wanted.
--
-- CATEGORY IMPACT (open lines, current data): SW $1,433,190.50 (1,299
-- lines) kept, FINNLOU $832,773.78 (1,131) kept, LUX $82,529.00 (234)
-- kept, blank/null $2,722.46 (20) kept, ALLOW -$41.66 (6) kept. Newly
-- excluded vs. the prior exclude-list approach: MISC $20,895.00 (48
-- lines) - was previously let through since MISC wasn't on the old
-- exclude-list. TARIFF ($110,371.67/295) and FREIGHTO ($66,387.53/289)
-- were already excluded before and remain excluded now.
--
-- The product_id 'Freight Out%' defensive check is KEPT alongside the
-- new include-list, per your explicit instruction to exclude Freight Out
-- regardless. Taken 100% literally, Andrew's query would let blank-
-- category "Freight Out:<state>-<code>" lines back in (NULL SalesCategory
-- is on the include-list) - this extra check prevents that gap, same as
-- the prior migration (20260913001900).
--
-- Nothing else changes: workflow_status filter, cancelled-line filter,
-- product_id-not-blank filter, qty_outstanding > 0, dealer/rep
-- attribution, branch/fulfillment_type mapping (WHSALES=warehouse,
-- MIXED/DIRECT=container) - all byte-for-byte identical.
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
    AND (
      NULLIF(TRIM(BOTH FROM ol.sales_category), '') IS NULL
      OR upper(TRIM(BOTH FROM ol.sales_category)) IN ('ALLOW', 'FINNLOU', 'LUX', 'SW')
    )
    AND ol.product_id NOT ILIKE 'Freight Out%'
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
  round(price * qty_outstanding * (1 - COALESCE(line_discount_pct, 0) / 100.0), 2)       AS open_so_amount,
  manager_id,
  workflow_status,
  round(price * qty_outstanding, 2)                                                     AS open_so_gross_amount,
  round(price * qty_outstanding * (COALESCE(line_discount_pct, 0) / 100.0), 2)           AS open_so_discount_amount
FROM lines;

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- 1. select count(distinct order_number) as open_orders, count(*) as open_lines,
--      round(sum(qty_open), 2) as open_units, round(sum(open_so_gross_amount),2) as gross,
--      round(sum(open_so_discount_amount),2) as discount, round(sum(open_so_amount), 2) as net
--    from public.v_portal_open_sales_order_line_facts;
--
-- 2. No lines outside the include-list remain:
--    SELECT sales_category, count(*) FROM v_portal_open_sales_order_line_facts
--    WHERE sales_category IS NOT NULL
--      AND upper(TRIM(sales_category)) NOT IN ('ALLOW','FINNLOU','LUX','SW')
--    GROUP BY 1;
--    -- expect 0 rows
--
-- 3. qty_open and order/line counts should only change due to the MISC
--    exclusion (and any other newly-excluded category), never due to the
--    discount formula.
-- ══════════════════════════════════════════════════════════════════════════════
