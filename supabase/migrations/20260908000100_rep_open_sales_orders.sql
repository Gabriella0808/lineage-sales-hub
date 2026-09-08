-- ══════════════════════════════════════════════════════════════════════════════
-- Open Sales Orders backlog, by rep/dealer, for the Rep Reporting detail drawer.
--
-- Replaces the "Lines" KPI card in InvoiceDetailSheet (RPC mode) with an
-- "Open Sales Orders" card showing the net dollar value of remaining open
-- backlog, plus a Sales-Order-grouped drill-down.
--
-- Source: public."dbo_Orders" (header) + public."dbo_OrderDetail" (lines) —
-- the Skyvia-replicated raw Acctivate tables, same tables already used by
-- kpi_monthly_booking_rollup / kpi_monthly_invoice_rollup for Live KPI. This
-- is a live VIEW (not materialized), so it always reflects the latest sync —
-- no separate manually-maintained dataset.
--
-- Columns confirmed live against the actual schema before writing this
-- (PostgREST column-probe, since no CREATE TABLE exists for these
-- Skyvia-managed tables in this migration history):
--   dbo_Orders:       GUIDOrder, OrderNumber, OrderDate, OrderStatus,
--                      CustomerID, GUIDCustomer, GUIDSalesperson,
--                      SalespersonID, BranchID, SubTotal, SoldToName,
--                      RequestedShipDate, EntryDate, _Rep1
--   dbo_OrderDetail:   GUIDOrder, GUIDOrderDetail, OrderNumber, ProductID,
--                      Description, ProductClass, SalesCategory, QtyOrdered,
--                      QtyShipped, QtyBackordered, QtyInvoiced, Price,
--                      LineDiscountPct, Amount, Freight, LineCancelled,
--                      MiscChargeType, Warehouse, _TariffAmt, _FreightAmt
--   (tbSalesperson does not exist under that name — salesperson display
--   name/normalization reuses public.acctivate_sales_reps, the exact same
--   join already used for "Invoices by Rep" in v_portal_invoice_line_facts.)
--
-- Open-order definition (per line):
--   • Header OrderStatus not cancelled / completed / void / closed (text match,
--     same defensive pattern already used by kpi_monthly_booking_rollup).
--   • Line not cancelled (LineCancelled), not a freight line (Freight),
--     not a misc-charge line (MiscChargeType set) — the exact same
--     freight/tariff/surcharge/drayage/QC exclusion mechanism already used
--     by kpi_monthly_booking_rollup and kpi_monthly_invoice_rollup (a set
--     MiscChargeType is Acctivate's own non-merchandise-charge flag, so this
--     comprehensively excludes freight/tariff/surcharge/drayage/QC lines
--     without guessing at SalesCategory string values I can't inspect live).
--   • Remaining quantity: qty_open = GREATEST(QtyOrdered - QtyShipped, 0);
--     only lines with qty_open > 0 are included, so fully-shipped
--     ("completed") lines never contribute.
--
-- Monetary value (per line, net of discount, scaled to the OPEN portion only —
-- not the original full-line amount, so partially-fulfilled orders count only
-- their remaining balance):
--   net_open_amount = Price * (1 - LineDiscountPct/100) * qty_open
--
-- Rep attribution mirrors "Invoices by Rep" exactly: SalespersonID (falling
-- back to _Rep1) is the canonical rep_id, joined to acctivate_sales_reps for
-- display name and to sales_reps for manager_id (same real_reps
-- territory-exclusion pattern as v_companywide_reporting_actuals). Orders
-- without a resolvable salesperson roll into 'Unassigned', same as elsewhere.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_rep_open_sales_order_lines AS
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
  LOWER(REPLACE(REPLACE(o."GUIDOrder"::text, '{', ''), '}', ''))            AS guid_order,
  o."OrderNumber"::text                                                     AS order_number,
  o."OrderDate"::date                                                       AS order_date,
  o."RequestedShipDate"::date                                               AS requested_ship_date,
  o."CustomerID"::text                                                      AS customer_id,
  COALESCE(NULLIF(TRIM(dl.name::text), ''), o."CustomerID"::text)           AS dealer_name,
  COALESCE(NULLIF(TRIM(o."SalespersonID"), ''), NULLIF(TRIM(o."_Rep1"), ''), '') AS rep_id,
  COALESCE(
    NULLIF(TRIM(asr.name::text), ''),
    NULLIF(TRIM(o."SalespersonID"), ''),
    NULLIF(TRIM(o."_Rep1"), ''),
    'Unassigned'
  )                                                                          AS rep_name,
  o."BranchID"::text                                                        AS branch_id,
  CASE UPPER(COALESCE(o."BranchID", ''))
    WHEN 'MIXED'   THEN 'container'
    WHEN 'DIRECT'  THEN 'container'
    WHEN 'WHSALES' THEN 'warehouse'
    ELSE 'unclassified'
  END                                                                        AS fulfillment_type,
  od."Warehouse"::text                                                      AS warehouse,
  od."ProductID"::text                                                      AS sku,
  od."Description"::text                                                    AS description,
  od."ProductClass"::text                                                   AS product_class,
  od."SalesCategory"::text                                                  AS sales_category,
  CASE
    WHEN od."SalesCategory" = 'SW'                          THEN 'Sea Winds'
    WHEN od."SalesCategory" IN ('FL', 'FINNLOU')             THEN 'Finn & Lou'
    WHEN UPPER(COALESCE(od."SalesCategory", '')) = 'LUX'     THEN 'Lux'
    WHEN od."SalesCategory" = 'ALLOW'
      OR COALESCE(od."SalesCategory", '') = ''                THEN 'ALLOW'
    ELSE NULL
  END                                                                        AS brand_category,
  COALESCE(od."QtyOrdered"::numeric, 0)                                     AS qty_ordered,
  COALESCE(od."QtyShipped"::numeric, 0)                                     AS qty_shipped,
  GREATEST(COALESCE(od."QtyOrdered"::numeric, 0) - COALESCE(od."QtyShipped"::numeric, 0), 0) AS qty_open,
  COALESCE(od."Price"::numeric, 0)                                          AS unit_price,
  COALESCE(od."LineDiscountPct"::numeric, 0)                                AS line_discount_pct,
  ROUND(
    COALESCE(od."Price"::numeric, 0)
    * (1 - COALESCE(od."LineDiscountPct"::numeric, 0) / 100.0)
    * GREATEST(COALESCE(od."QtyOrdered"::numeric, 0) - COALESCE(od."QtyShipped"::numeric, 0), 0)
  , 2)                                                                       AS net_open_amount,
  rr.manager_id
FROM public."dbo_Orders" o
JOIN public."dbo_OrderDetail" od
  ON od."GUIDOrder" = o."GUIDOrder"
LEFT JOIN public.dealers dl
  ON dl.acctivate_id = o."CustomerID"
LEFT JOIN public.acctivate_sales_reps asr
  ON LOWER(TRIM(asr.acctivate_id)) = LOWER(TRIM(o."SalespersonID"))
LEFT JOIN real_reps rr
  ON LOWER(TRIM(rr.canonical_rep_key)) = LOWER(TRIM(
       COALESCE(NULLIF(TRIM(o."SalespersonID"), ''), NULLIF(TRIM(o."_Rep1"), ''), '')
     ))
WHERE o."OrderDate" IS NOT NULL
  AND COALESCE(o."OrderStatus", '') NOT ILIKE '%cancel%'
  AND COALESCE(o."OrderStatus", '') NOT ILIKE '%complet%'
  AND COALESCE(o."OrderStatus", '') NOT ILIKE '%void%'
  AND COALESCE(o."OrderStatus", '') NOT ILIKE '%closed%'
  AND COALESCE(od."Freight", false) IS NOT TRUE
  AND COALESCE(od."LineCancelled", false) IS NOT TRUE
  AND (od."MiscChargeType" IS NULL OR TRIM(od."MiscChargeType") = '')
  AND (COALESCE(od."QtyOrdered"::numeric, 0) - COALESCE(od."QtyShipped"::numeric, 0)) > 0;

GRANT SELECT ON public.v_rep_open_sales_order_lines TO anon, authenticated;

-- ─── Drill-down / KPI RPC — mirrors get_sales_reporting_detail_lines exactly ──
-- (same p_group_by/p_entity_key/p_customer_ids/p_brand_cats/p_skus/p_rep_ids/
-- p_manager_id signature and entity_key formula, so it plugs into the same
-- Rep Reporting filters — rep, territory→dealer, dealer, brand, SKU — without
-- a separate, inconsistent filtering mechanism. No date params: open orders
-- are a current snapshot, not scoped to the report's date range.

CREATE OR REPLACE FUNCTION public.get_open_sales_order_lines(
  p_group_by     text,
  p_entity_key   text,
  p_customer_ids text[]  DEFAULT NULL,
  p_brand_cats   text[]  DEFAULT NULL,
  p_skus         text[]  DEFAULT NULL,
  p_rep_ids      text[]  DEFAULT NULL,
  p_manager_id   uuid    DEFAULT NULL,
  p_limit        int     DEFAULT 2000,
  p_offset       int     DEFAULT 0
)
RETURNS TABLE (
  guid_order          text,
  order_number        text,
  order_date          date,
  requested_ship_date date,
  customer_id         text,
  dealer_name         text,
  rep_id              text,
  rep_name            text,
  fulfillment_type    text,
  warehouse           text,
  sku                 text,
  description         text,
  product_class       text,
  brand_category      text,
  qty_ordered         numeric,
  qty_shipped         numeric,
  qty_open            numeric,
  unit_price          numeric,
  line_discount_pct   numeric,
  net_open_amount     numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    a.guid_order, a.order_number, a.order_date, a.requested_ship_date,
    a.customer_id, a.dealer_name, a.rep_id, a.rep_name,
    a.fulfillment_type, a.warehouse, a.sku, a.description, a.product_class,
    a.brand_category, a.qty_ordered, a.qty_shipped, a.qty_open,
    a.unit_price, a.line_discount_pct, a.net_open_amount
  FROM public.v_rep_open_sales_order_lines a
  WHERE
    (
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
         OR COALESCE(a.brand_category, '') = ANY(p_brand_cats))
    AND (p_skus IS NULL OR array_length(p_skus, 1) IS NULL OR a.sku = ANY(p_skus))
    AND (p_rep_ids IS NULL
         OR (NULLIF(TRIM(a.rep_id::text), '') IS NOT NULL
             AND lower(TRIM(a.rep_id::text)) = ANY(p_rep_ids)))
  ORDER BY a.order_date DESC, a.order_number, a.sku
  LIMIT  p_limit
  OFFSET p_offset
$$;

GRANT EXECUTE ON FUNCTION public.get_open_sales_order_lines(
  text, text, text[], text[], text[], text[], uuid, int, int
) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Overall reconciliation snapshot:
-- SELECT
--   COUNT(DISTINCT guid_order) AS open_orders,
--   COUNT(*)                   AS open_lines,
--   ROUND(SUM(net_open_amount), 2) AS total_open_value
-- FROM public.v_rep_open_sales_order_lines;

-- 2. By rep (compare against Acctivate for at least 3 reps):
-- SELECT rep_name, rep_id,
--   COUNT(DISTINCT guid_order) AS open_orders,
--   COUNT(*)                   AS open_lines,
--   ROUND(SUM(net_open_amount), 2) AS total_open_value
-- FROM public.v_rep_open_sales_order_lines
-- GROUP BY rep_name, rep_id
-- ORDER BY total_open_value DESC;

-- 3. Spot-check a single order's open-vs-shipped math:
-- SELECT order_number, sku, qty_ordered, qty_shipped, qty_open,
--        unit_price, line_discount_pct, net_open_amount
-- FROM public.v_rep_open_sales_order_lines
-- WHERE order_number = '<some order number from step 2>'
-- ORDER BY sku;
