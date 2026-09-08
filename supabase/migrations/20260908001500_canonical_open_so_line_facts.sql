-- ══════════════════════════════════════════════════════════════════════════════
-- Canonical Open Sales Order line-facts view, replacing the earlier ad-hoc
-- v_rep_open_sales_order_lines with a properly rep-mapped, correctly-priced
-- view matching the naming convention already used for the rest of
-- Dealer/Rep Reporting (v_portal_invoice_line_facts, v_portal_bookings_line_facts).
--
-- WHY THE RENAME/REBUILD (fixes found during review):
--
-- 1. Amount formula field check. dbo_OrderDetail has TWO distinct price
--    columns: "Price" and "_OriginalPrice". They differ — "_OriginalPrice"
--    is a lower reference/catalog price, NOT what the order actually bills
--    at. Verified empirically: dbo_OrderDetail."Amount" reconciles exactly
--    to Price * QtyOrdered * (1 - LineDiscountPct/100) in every sampled row;
--    it does NOT reconcile using _OriginalPrice (e.g. one sample: Price
--    607.20 * 0.9 = 546.48 = Amount; _OriginalPrice 552.00 * 0.9 = 496.80 !=
--    Amount). So "Price" is used as the per-unit price here — using
--    _OriginalPrice would have understated the backlog.
--
-- 2. Formula fallback for the rare case Price is null (2 of 3,954 lines):
--      open_so_amount =
--        CASE WHEN "Price" IS NOT NULL
--          THEN qty_open * "Price" * (1 - LineDiscountPct/100)
--          ELSE (Amount - "_TariffAmt" - "_FreightAmt") * (qty_open / NULLIF(qty_ordered,0))
--        END
--    This prorates the net (tariff/freight-excluded) full-line amount by the
--    open share of the line, instead of ever multiplying qty_open by the
--    full-line Amount directly (Amount is a LINE total, not a unit price —
--    qty_open * Amount would overstate backlog by a factor of qty_ordered).
--
-- 3. Rep mapping now mirrors the exact chain Dealer/Rep Reporting already
--    uses for bookings (v_portal_dealer_rep_reporting_lines's
--    order_salesperson_lookup CTE): dbo_Orders.SalespersonID (rep_id, the
--    canonical code) with SalespersonName / _Rep1 / _Rep2 as additional
--    fallbacks for the display name, joined to acctivate_sales_reps for the
--    canonical display name exactly as "Invoices by Rep" does. Orders with
--    no resolvable salesperson roll into 'Unassigned', not blank.
--
-- 4. Safe numeric casting: dbo_OrderDetail's numeric columns are cast via a
--    blank-string guard (NULLIF(...,'')) before ::numeric, so an empty
--    string never raises a cast error — it becomes NULL/0 instead of
--    failing the whole query.
--
-- 5. Dealer grouping key is customer_id (not dealer_name) throughout.
--
-- Open-order definition (unchanged from the prior validated fix): header not
-- cancelled/completed/void/closed (via OrderStatusDescription, since
-- OrderStatus is a single-letter code — S/C/X/K — not a word), line not
-- cancelled/freight, SalesCategory not in the standard exclusion set used
-- everywhere else in this app, and qty_open > 0.
-- ══════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_open_sales_order_lines(text,text,text[],text[],text[],text[],uuid,int,int);
DROP VIEW IF EXISTS public.v_rep_open_sales_order_lines;

CREATE OR REPLACE VIEW public.v_portal_open_sales_order_line_facts AS
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
),
lines AS (
  SELECT
    o."GUIDOrder"                                                            AS raw_guid_order,
    o."OrderNumber"::text                                                    AS order_number,
    o."OrderDate"::date                                                      AS order_date,
    o."RequestedShipDate"::date                                              AS requested_ship_date,
    o."CustomerID"::text                                                     AS customer_id,
    dl.name::text                                                            AS dealer_lookup_name,
    -- rep_id: canonical Acctivate salesperson code, same field Dealer/Rep
    -- Reporting uses for its rep_id (SalespersonID, falling back to _Rep1/_Rep2).
    COALESCE(
      NULLIF(TRIM(o."SalespersonID"), ''),
      NULLIF(TRIM(o."_Rep1"), ''),
      NULLIF(TRIM(o."_Rep2"), ''),
      ''
    )                                                                        AS rep_id,
    -- rep_name: canonical display name, same acctivate_sales_reps join used
    -- for "Invoices by Rep", falling back through the same chain
    -- v_portal_dealer_rep_reporting_lines uses for bookings.
    COALESCE(
      NULLIF(TRIM(asr.name::text), ''),
      NULLIF(TRIM(o."SalespersonName"::text), ''),
      NULLIF(TRIM(o."SalespersonID"), ''),
      NULLIF(TRIM(o."_Rep1"), ''),
      NULLIF(TRIM(o."_Rep2"), ''),
      'Unassigned'
    )                                                                        AS rep_name,
    o."BranchID"::text                                                      AS branch_id,
    CASE UPPER(COALESCE(o."BranchID", ''))
      WHEN 'MIXED'   THEN 'container'
      WHEN 'DIRECT'  THEN 'container'
      WHEN 'WHSALES' THEN 'warehouse'
      ELSE 'unclassified'
    END                                                                      AS fulfillment_type,
    od."Warehouse"::text                                                    AS warehouse,
    od."ProductID"::text                                                    AS sku,
    od."Description"::text                                                  AS description,
    od."ProductClass"::text                                                 AS product_class,
    od."SalesCategory"::text                                                AS sales_category,
    CASE
      WHEN od."SalesCategory" = 'SW'                          THEN 'Sea Winds'
      WHEN od."SalesCategory" IN ('FL', 'FINNLOU')             THEN 'Finn & Lou'
      WHEN UPPER(COALESCE(od."SalesCategory", '')) = 'LUX'     THEN 'Lux'
      WHEN od."SalesCategory" = 'ALLOW'
        OR COALESCE(od."SalesCategory", '') = ''                THEN 'ALLOW'
      ELSE NULL
    END                                                                      AS brand_category,
    -- Safe numeric casts: blank-string guarded before ::numeric so a stray
    -- empty string can never raise a cast error.
    COALESCE(NULLIF(TRIM(od."QtyOrdered"::text), '')::numeric, 0)           AS qty_ordered,
    COALESCE(NULLIF(TRIM(od."QtyShipped"::text), '')::numeric, 0)           AS qty_shipped,
    NULLIF(TRIM(od."Price"::text), '')::numeric                             AS price,
    COALESCE(NULLIF(TRIM(od."LineDiscountPct"::text), '')::numeric, 0)      AS line_discount_pct,
    COALESCE(NULLIF(TRIM(od."Amount"::text), '')::numeric, 0)               AS amount,
    COALESCE(NULLIF(TRIM(od."_TariffAmt"::text), '')::numeric, 0)           AS tariff_amount,
    COALESCE(NULLIF(TRIM(od."_FreightAmt"::text), '')::numeric, 0)          AS freight_amount,
    rr.manager_id
  FROM public."dbo_Orders" o
  JOIN public."dbo_OrderDetail" od
    ON od."GUIDOrder" = o."GUIDOrder"
  LEFT JOIN public.dealers dl
    ON dl.acctivate_id = o."CustomerID"
  LEFT JOIN public.acctivate_sales_reps asr
    ON LOWER(TRIM(asr.acctivate_id)) = LOWER(TRIM(
         COALESCE(NULLIF(TRIM(o."SalespersonID"), ''), NULLIF(TRIM(o."_Rep1"), ''), NULLIF(TRIM(o."_Rep2"), ''))
       ))
  LEFT JOIN real_reps rr
    ON LOWER(TRIM(rr.canonical_rep_key)) = LOWER(TRIM(
         COALESCE(NULLIF(TRIM(o."SalespersonID"), ''), NULLIF(TRIM(o."_Rep1"), ''), NULLIF(TRIM(o."_Rep2"), ''))
       ))
  WHERE o."OrderDate" IS NOT NULL
    AND COALESCE(o."OrderStatusDescription", '') NOT ILIKE '%cancel%'
    AND COALESCE(o."OrderStatusDescription", '') NOT ILIKE '%complet%'
    AND COALESCE(o."OrderStatusDescription", '') NOT ILIKE '%void%'
    AND COALESCE(o."OrderStatusDescription", '') NOT ILIKE '%closed%'
    AND COALESCE(od."Freight", false) IS NOT TRUE
    AND COALESCE(od."LineCancelled", false) IS NOT TRUE
    AND COALESCE(od."SalesCategory", '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF')
)
SELECT
  LOWER(REPLACE(REPLACE(raw_guid_order::text, '{', ''), '}', ''))            AS guid_order,
  order_number,
  order_date,
  requested_ship_date,
  customer_id,
  COALESCE(NULLIF(TRIM(dealer_lookup_name), ''), customer_id)                AS dealer_name,
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
  GREATEST(qty_ordered - qty_shipped, 0)                                    AS qty_open,
  price                                                                      AS unit_price,
  line_discount_pct,
  ROUND(
    CASE
      WHEN price IS NOT NULL THEN
        GREATEST(qty_ordered - qty_shipped, 0) * price * (1 - line_discount_pct / 100.0)
      ELSE
        (amount - tariff_amount - freight_amount)
        * (GREATEST(qty_ordered - qty_shipped, 0) / NULLIF(qty_ordered, 0))
    END
  , 2)                                                                       AS open_so_amount,
  manager_id
FROM lines
WHERE GREATEST(qty_ordered - qty_shipped, 0) > 0;

GRANT SELECT ON public.v_portal_open_sales_order_line_facts TO anon, authenticated;

-- ─── Drill-down / KPI RPC — same signature/entity_key formula as
-- get_sales_reporting_detail_lines, now reading the canonical view. ──────────

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
  rep_name             text,
  fulfillment_type     text,
  warehouse             text,
  sku                   text,
  description           text,
  product_class         text,
  brand_category        text,
  qty_ordered           numeric,
  qty_shipped           numeric,
  qty_open              numeric,
  unit_price            numeric,
  line_discount_pct     numeric,
  net_open_amount       numeric
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
    a.unit_price, a.line_discount_pct, a.open_so_amount
  FROM public.v_portal_open_sales_order_line_facts a
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

-- 1. select count(distinct order_number) as open_orders, count(*) as open_lines,
--      round(sum(qty_open),2) as open_units, round(sum(open_so_amount),2) as open_so_value
--    from public.v_portal_open_sales_order_line_facts;
--
-- 2. select rep_name, rep_id, count(distinct order_number) as open_orders,
--      count(*) as open_lines, round(sum(qty_open),2) as open_units,
--      round(sum(open_so_amount),2) as open_so_value
--    from public.v_portal_open_sales_order_line_facts
--    group by rep_name, rep_id order by open_so_value desc;
--
-- 3. select dealer_name, customer_id, count(distinct order_number) as open_orders,
--      count(*) as open_lines, round(sum(qty_open),2) as open_units,
--      round(sum(open_so_amount),2) as open_so_value
--    from public.v_portal_open_sales_order_line_facts
--    group by dealer_name, customer_id order by open_so_value desc;
