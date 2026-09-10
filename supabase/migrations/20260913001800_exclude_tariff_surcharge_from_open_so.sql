-- ══════════════════════════════════════════════════════════════════════════════
-- Exclude tariff and surcharge lines from Open Sales Orders, at the source,
-- so they cannot leak into any Open SO total downstream (company-wide,
-- Dealer Reporting, Rep Reporting, KPI cards, drill-down/detail views, or
-- any grouped/summary RPC - all of them read v_portal_open_sales_order_
-- line_facts, directly or via get_open_sales_order_lines()).
--
-- INVESTIGATION (not guessed - queried directly against the live data):
--   1. Full distinct portal_acctivate_order_lines.sales_category values:
--      SW, FINNLOU, TARIFF, '' (blank), LUX, FREIGHTO, MISC, ALLOW,
--      SALESTAX, NULL. No standalone SURCHARGE value currently exists.
--   2. Every row whose product_id/description contains the word
--      "surcharge" (searched with ILIKE across the whole order-lines
--      table) already carries sales_category = 'TARIFF' - product_id
--      "Tariff Surcharge" / "TSUR-CHANGE", description "Tariff surcharge".
--      There is no independent surcharge line item separate from tariff
--      in this dataset; "surcharge" only ever occurs as tariff-surcharge
--      text describing a TARIFF-category row.
--   3. Currently-open TARIFF-category lines: 296 rows, $110,776.64.
--      Currently-open rows with sales_category = 'SURCHARGE': 0 rows, $0.
--
-- CLASSIFICATION FIELD USED: sales_category (the canonical Acctivate
-- category field, same field v_portal_bookings_line_facts and
-- v_portal_dealer_rep_reporting_lines already key off for category
-- logic - not product_class, not description text).
--
-- EXCLUSION CONDITION: upper(TRIM(COALESCE(sales_category, ''))) NOT IN
-- ('TARIFF', 'SURCHARGE'). SURCHARGE is included defensively for
-- consistency with the non-sales-category exclusion set already
-- established elsewhere in reporting (tariff/freighto/salestax/ccfee/
-- freight/tax/surcharge/qc, see EXCLUDED_BRAND_CATS in
-- InvoiceDetailSheet.tsx) even though it currently matches 0 Open SO
-- rows - if Acctivate ever introduces a distinct surcharge code, it is
-- already covered without a further migration.
--
-- Nothing else changes: qty/price/open_so_amount formula, dealer/rep
-- attribution (rep_id/rep_name resolution from 20260913001500), date/
-- workflow_status filters, fulfillment_type, and every other column are
-- byte-for-byte identical to the prior version of this view.
--
-- Untouched: bookings, invoiced logic (v_portal_bookings_line_facts,
-- get_portal_invoiced_lines - not modified), dealer/rep attribution,
-- date logic, order-status logic, quantities, Dealer/Rep Reporting date
-- filter clamp, Labor Day Promo, the 97-row Step 2 diagnostic.
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
-- 1. No TARIFF or SURCHARGE rows can remain:
--    SELECT count(*) FROM v_portal_open_sales_order_line_facts
--    WHERE upper(TRIM(COALESCE(sales_category,''))) IN ('TARIFF','SURCHARGE');
--    -- expect 0
--
-- 2. Company-wide total drops from $2,522,203.66 to $2,411,427.02
--    (296 tariff rows / $110,776.64 removed, 0 surcharge rows):
--    SELECT count(*), round(sum(open_so_amount)::numeric,2)
--    FROM v_portal_open_sales_order_line_facts;
--
-- 3. Bookings/invoiced totals must be byte-for-byte unchanged - this
--    migration does not touch v_portal_bookings_line_facts,
--    get_portal_invoiced_lines(), or v_portal_dealer_rep_reporting_lines.
--
-- 4. Dealer/rep attribution (rep_id/rep_name/customer_id/dealer_name)
--    must be unchanged from the 20260913001500 fix - only the row-level
--    sales_category filter was added.
-- ══════════════════════════════════════════════════════════════════════════════
