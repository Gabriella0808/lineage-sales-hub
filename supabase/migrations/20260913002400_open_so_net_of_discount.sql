-- ══════════════════════════════════════════════════════════════════════════════
-- Apply line_discount_pct to Open Sales Orders value.
--
-- INVESTIGATION (confirmed, not assumed):
--   - line_discount_pct is already synced: scripts/acctivate-sync/
--     sync-open-sales-orders.ps1 already pulls od.LineDiscountPct AS
--     line_discount_pct (line ~180) and it's already in the Supabase
--     upload whitelist (line ~267). Live data: 3,310/3,322 currently-open
--     lines have a value, 860 of them non-zero. No PowerShell change
--     needed.
--   - Freight Out exclusion is already implemented (20260913001900) -
--     re-confirmed 0 FREIGHTO/"Freight Out%" rows remain in the view.
--     No new exclusion work needed here.
--   - The view already selected line_discount_pct as an output column,
--     but open_so_amount never applied it: was round(price *
--     qty_outstanding, 2), pre-discount.
--
-- CHANGE: open_so_amount is now net of the line discount. Two new
-- columns expose the breakdown:
--   open_so_gross_amount    = price * qty_outstanding
--   open_so_discount_amount = price * qty_outstanding * (discount_pct/100)
--   open_so_amount           = gross - discount   (net; unchanged column
--                                                   name, so every existing
--                                                   consumer picks up the
--                                                   net figure automatically)
-- NULL line_discount_pct is treated as 0 (COALESCE), matching the
-- existing pattern already used for this column elsewhere in the view.
--
-- Nothing else changes: qty_open, order/line counts, workflow_status
-- filter, cancelled-line filter, tariff/surcharge/freight-out exclusions,
-- dealer/rep attribution - all byte-for-byte identical to the prior
-- version of this view.
--
-- Downstream consumers all read open_so_amount directly from this view
-- (confirmed by reading each): get_open_sales_order_lines RPC (Dealer/
-- Rep Reporting drawer), get_sales_reporting_grouped_rows's open_so_agg
-- CTE (Dealer/Rep Reporting Open SO column), src/hooks/useOpenSalesOrders.ts
-- (Live KPI Open SO card, Inventory > Backlog, per its own doc-comment),
-- src/hooks/useInventoryHub.ts. None of them need code changes - they
-- all pick up the net amount automatically.
--
-- Untouched: bookings, invoiced, Labor Day Promo, Acctivate sync scripts,
-- dealer/rep roster matching.
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
  round(price * qty_outstanding * (1 - COALESCE(line_discount_pct, 0) / 100.0), 2)       AS open_so_amount,
  manager_id,
  workflow_status,
  round(price * qty_outstanding, 2)                                                     AS open_so_gross_amount,
  round(price * qty_outstanding * (COALESCE(line_discount_pct, 0) / 100.0), 2)           AS open_so_discount_amount
FROM lines;

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- 1. Scott's exact query - open_so_value should now be net of discount:
--    select count(distinct order_number) as open_orders, count(*) as open_lines,
--      round(sum(qty_open), 2) as open_units, round(sum(open_so_amount), 2) as open_so_value
--    from public.v_portal_open_sales_order_line_facts;
--
-- 2. Gross/discount/net reconciliation:
--    SELECT round(sum(open_so_gross_amount)::numeric,2) AS gross,
--           round(sum(open_so_discount_amount)::numeric,2) AS discount,
--           round(sum(open_so_amount)::numeric,2) AS net
--    FROM v_portal_open_sales_order_line_facts;
--    -- expect gross - discount = net, and gross = the pre-migration total
--
-- 3. qty_open and order/line counts must be unchanged from before this
--    migration (only open_so_amount moves).
-- ══════════════════════════════════════════════════════════════════════════════
