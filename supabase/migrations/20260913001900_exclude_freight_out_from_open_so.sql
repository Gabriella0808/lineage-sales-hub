-- ══════════════════════════════════════════════════════════════════════════════
-- Exclude Freight Out lines from Open Sales Orders, at the source, so they
-- cannot leak into any downstream Open SO total (Live KPI, Inventory >
-- Backlog, Dealer/Rep Reporting Open SO Value, drill-down/detail views) -
-- all read v_portal_open_sales_order_line_facts, directly or via
-- get_open_sales_order_lines().
--
-- INVESTIGATION (not guessed - queried directly against the live data):
--   1. sales_category = 'FREIGHTO' is the primary, reliable canonical
--      value: 293 currently-open lines, $68,455.99, 257.33 units.
--      product_id values are state/carrier-specific freight lines, e.g.
--      "Freight Out:FL-7-SBFX" ("Fixed freight over $1,500 to FL via
--      Sunbelt."), "Freight Out" (flat), etc. - all clearly freight-out
--      shipping charges.
--   2. Defensive fallback confirmed necessary: 18 additional currently-
--      open lines ($2,698.43) are the SAME "Freight Out:<state>-<code>"
--      product_id pattern but have sales_category = '' (blank) - i.e.
--      genuine Freight Out lines missing category tagging. Caught via
--      product_id ILIKE 'Freight Out%' - a narrow prefix match on the
--      confirmed product_id pattern, not a broad "contains freight" scan.
--   3. Checked for other freight-adjacent lines and found ONE distinct
--      item NOT excluded by this migration: "Ocean Freight Pass Through"
--      (sales_category = 'MISC', 2 lines, $16,895.00) - "Ocean Freight
--      Pass-through charges for Direct Containers". This is a materially
--      different, materially large line item (pass-through container
--      shipping cost, not a "Freight Out" delivery charge) that does not
--      match the FREIGHTO category or the "Freight Out" product_id
--      pattern - left untouched per the explicit instruction not to
--      over-exclude by broad keyword without confirmation. Flagged to
--      the requester as a separate, undecided item.
--
-- CLASSIFICATION FIELD USED: sales_category (primary, canonical), with
-- product_id as the confirmed defensive fallback for the small set of
-- rows missing category tagging - not a description-text scan.
--
-- EXCLUSION CONDITION:
--   upper(TRIM(COALESCE(ol.sales_category, ''))) = 'FREIGHTO'
--   OR ol.product_id ILIKE 'Freight Out%'
--
-- Open SO formula (price * qty_outstanding), all existing filters
-- (workflow_status, line_cancelled, product_id not blank, qty_outstanding
-- > 0), branch/fulfillment_type logic, and dealer/rep attribution
-- (20260913001500) are byte-for-byte unchanged - this is strictly an
-- additional row-level exclusion, same pattern as the prior tariff/
-- surcharge exclusion (20260913001800).
--
-- Untouched: bookings (v_portal_bookings_line_facts), invoiced
-- (get_portal_invoiced_lines), July invoice/bookings logic, Labor Day
-- Promo, dealer/rep roster matching, the booking SalesCategory whitelist.
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
    AND upper(TRIM(BOTH FROM COALESCE(ol.sales_category, ''))) NOT IN ('TARIFF', 'SURCHARGE')
    AND upper(TRIM(BOTH FROM COALESCE(ol.sales_category, ''))) <> 'FREIGHTO'
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
  round(price * qty_outstanding, 2) AS open_so_amount,
  manager_id,
  workflow_status
FROM lines;

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- 1. No FREIGHTO / Freight Out rows can remain:
--    SELECT count(*) FROM v_portal_open_sales_order_line_facts
--    WHERE upper(TRIM(COALESCE(sales_category,''))) = 'FREIGHTO'
--       OR sku ILIKE 'Freight Out%';
--    -- expect 0
--
-- 2. Company-wide total drops from $2,411,427.02 to $2,340,272.60
--    (293 FREIGHTO rows / $68,455.99 + 18 blank-category "Freight Out"
--    rows / $2,698.43 = $71,154.42 removed):
--    SELECT count(*), round(sum(open_so_amount)::numeric,2)
--    FROM v_portal_open_sales_order_line_facts;
--
-- 3. Bookings/invoiced totals, July logic, Labor Day Promo, and dealer/
--    rep roster matching are untouched - this migration does not modify
--    v_portal_bookings_line_facts, get_portal_invoiced_lines(), or any
--    booking SalesCategory whitelist logic.
--
-- 4. "Ocean Freight Pass Through" (sales_category='MISC', 2 lines,
--    $16,895.00) is intentionally NOT excluded by this migration - flag
--    for a separate decision if it should also be treated as freight.
-- ══════════════════════════════════════════════════════════════════════════════
