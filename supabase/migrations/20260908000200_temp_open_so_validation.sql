-- ══════════════════════════════════════════════════════════════════════════════
-- TEMPORARY validation functions for the Open Sales Orders backlog feature.
-- Not used by the app. Dropped in a follow-up migration once validation is done.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._diag_order_status_distribution()
RETURNS TABLE (order_status text, cnt bigint, min_order_date date, max_order_date date, max_updated timestamp)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT o."OrderStatus"::text, COUNT(*), MIN(o."OrderDate"::date), MAX(o."OrderDate"::date), MAX(o."UpdatedDate"::timestamp)
  FROM public."dbo_Orders" o
  GROUP BY o."OrderStatus"
  ORDER BY 2 DESC;
$$;
GRANT EXECUTE ON FUNCTION public._diag_order_status_distribution() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public._diag_orders_overview()
RETURNS TABLE (total_orders bigint, max_order_date date, max_updated timestamp, min_order_date date)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT COUNT(*), MAX(o."OrderDate"::date), MAX(o."UpdatedDate"::timestamp), MIN(o."OrderDate"::date)
  FROM public."dbo_Orders" o;
$$;
GRANT EXECUTE ON FUNCTION public._diag_orders_overview() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public._diag_qty_fields(p_limit int DEFAULT 25)
RETURNS TABLE (
  guid_order text, order_number text, order_status text,
  qty_ordered numeric, qty_shipped numeric, qty_backordered numeric, qty_invoiced numeric,
  price numeric, line_discount_pct numeric, amount numeric, misc_charge_type text, freight boolean, line_cancelled boolean
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    od."GUIDOrder"::text, od."OrderNumber"::text, o."OrderStatus"::text,
    od."QtyOrdered"::numeric, od."QtyShipped"::numeric, od."QtyBackordered"::numeric, od."QtyInvoiced"::numeric,
    od."Price"::numeric, od."LineDiscountPct"::numeric, od."Amount"::numeric,
    od."MiscChargeType"::text, od."Freight", od."LineCancelled"
  FROM public."dbo_OrderDetail" od
  JOIN public."dbo_Orders" o ON o."GUIDOrder" = od."GUIDOrder"
  WHERE COALESCE(od."QtyOrdered"::numeric,0) > COALESCE(od."QtyShipped"::numeric,0)
    AND COALESCE(od."QtyShipped"::numeric,0) > 0
  ORDER BY od."GUIDOrder"
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public._diag_qty_fields(int) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public._diag_discount_check(p_limit int DEFAULT 25)
RETURNS TABLE (
  guid_order text, order_number text, sku text,
  qty_ordered numeric, price numeric, line_discount_pct numeric, amount numeric,
  price_x_qty numeric, price_x_qty_discounted numeric
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    od."GUIDOrder"::text, od."OrderNumber"::text, od."ProductID"::text,
    od."QtyOrdered"::numeric, od."Price"::numeric, od."LineDiscountPct"::numeric, od."Amount"::numeric,
    (od."Price"::numeric * od."QtyOrdered"::numeric) AS price_x_qty,
    (od."Price"::numeric * od."QtyOrdered"::numeric * (1 - COALESCE(od."LineDiscountPct"::numeric,0)/100.0)) AS price_x_qty_discounted
  FROM public."dbo_OrderDetail" od
  WHERE COALESCE(od."LineDiscountPct"::numeric,0) > 0
    AND COALESCE(od."Freight", false) IS NOT TRUE
    AND (od."MiscChargeType" IS NULL OR TRIM(od."MiscChargeType") = '')
    AND COALESCE(od."LineCancelled", false) IS NOT TRUE
  ORDER BY od."GUIDOrder"
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public._diag_discount_check(int) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public._diag_charge_lines(p_limit int DEFAULT 25)
RETURNS TABLE (
  guid_order text, order_number text, sku text, sales_category text,
  misc_charge_type text, freight boolean, line_cancelled boolean,
  qty_ordered numeric, price numeric, amount numeric
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    od."GUIDOrder"::text, od."OrderNumber"::text, od."ProductID"::text, od."SalesCategory"::text,
    od."MiscChargeType"::text, od."Freight", od."LineCancelled",
    od."QtyOrdered"::numeric, od."Price"::numeric, od."Amount"::numeric
  FROM public."dbo_OrderDetail" od
  WHERE COALESCE(od."Freight", false) IS TRUE
     OR (od."MiscChargeType" IS NOT NULL AND TRIM(od."MiscChargeType") <> '')
  ORDER BY od."GUIDOrder"
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public._diag_charge_lines(int) TO anon, authenticated;

-- Raw (bypasses the view entirely) rep-level reconciliation, computed directly
-- from dbo_Orders + dbo_OrderDetail with the same exclusion rules spelled out
-- inline, independent of v_rep_open_sales_order_lines / get_open_sales_order_lines,
-- so it can be compared against the production view's output as a cross-check.
CREATE OR REPLACE FUNCTION public._diag_rep_reconciliation(p_rep_ids text[])
RETURNS TABLE (
  rep_id text, order_count bigint, line_count bigint, total_open_value numeric
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    COALESCE(NULLIF(TRIM(o."SalespersonID"), ''), NULLIF(TRIM(o."_Rep1"), ''), '')::text AS rep_id,
    COUNT(DISTINCT o."GUIDOrder")::bigint AS order_count,
    COUNT(*)::bigint AS line_count,
    ROUND(SUM(
      od."Price"::numeric * (1 - COALESCE(od."LineDiscountPct"::numeric,0)/100.0)
      * GREATEST(COALESCE(od."QtyOrdered"::numeric,0) - COALESCE(od."QtyShipped"::numeric,0), 0)
    ), 2) AS total_open_value
  FROM public."dbo_Orders" o
  JOIN public."dbo_OrderDetail" od ON od."GUIDOrder" = o."GUIDOrder"
  WHERE o."OrderDate" IS NOT NULL
    AND COALESCE(o."OrderStatus", '') NOT ILIKE '%cancel%'
    AND COALESCE(o."OrderStatus", '') NOT ILIKE '%complet%'
    AND COALESCE(o."OrderStatus", '') NOT ILIKE '%void%'
    AND COALESCE(o."OrderStatus", '') NOT ILIKE '%closed%'
    AND COALESCE(od."Freight", false) IS NOT TRUE
    AND COALESCE(od."LineCancelled", false) IS NOT TRUE
    AND (od."MiscChargeType" IS NULL OR TRIM(od."MiscChargeType") = '')
    AND (COALESCE(od."QtyOrdered"::numeric,0) - COALESCE(od."QtyShipped"::numeric,0)) > 0
    AND COALESCE(NULLIF(TRIM(o."SalespersonID"), ''), NULLIF(TRIM(o."_Rep1"), ''), '') = ANY(p_rep_ids)
  GROUP BY 1
  ORDER BY 4 DESC;
$$;
GRANT EXECUTE ON FUNCTION public._diag_rep_reconciliation(text[]) TO anon, authenticated;

-- Sample scenario finder: one fully-open order, one partial, one cancelled,
-- one completed, one with charge lines, one with a discount.
CREATE OR REPLACE FUNCTION public._diag_scenario_orders()
RETURNS TABLE (scenario text, guid_order text, order_number text, order_status text, sample_line jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT 'fully_open', o."GUIDOrder"::text, o."OrderNumber"::text, o."OrderStatus"::text,
    jsonb_build_object('qty_ordered', od."QtyOrdered", 'qty_shipped', od."QtyShipped")
  FROM public."dbo_Orders" o JOIN public."dbo_OrderDetail" od ON od."GUIDOrder" = o."GUIDOrder"
  WHERE COALESCE(od."QtyShipped"::numeric,0) = 0 AND COALESCE(od."QtyOrdered"::numeric,0) > 0
    AND COALESCE(o."OrderStatus",'') NOT ILIKE '%cancel%' AND COALESCE(o."OrderStatus",'') NOT ILIKE '%complet%'
  LIMIT 1;

  RETURN QUERY
  SELECT 'partial', o."GUIDOrder"::text, o."OrderNumber"::text, o."OrderStatus"::text,
    jsonb_build_object('qty_ordered', od."QtyOrdered", 'qty_shipped', od."QtyShipped")
  FROM public."dbo_Orders" o JOIN public."dbo_OrderDetail" od ON od."GUIDOrder" = o."GUIDOrder"
  WHERE COALESCE(od."QtyShipped"::numeric,0) > 0
    AND COALESCE(od."QtyOrdered"::numeric,0) > COALESCE(od."QtyShipped"::numeric,0)
  LIMIT 1;

  RETURN QUERY
  SELECT 'cancelled', o."GUIDOrder"::text, o."OrderNumber"::text, o."OrderStatus"::text, '{}'::jsonb
  FROM public."dbo_Orders" o
  WHERE COALESCE(o."OrderStatus",'') ILIKE '%cancel%'
  LIMIT 1;

  RETURN QUERY
  SELECT 'completed', o."GUIDOrder"::text, o."OrderNumber"::text, o."OrderStatus"::text, '{}'::jsonb
  FROM public."dbo_Orders" o
  WHERE COALESCE(o."OrderStatus",'') ILIKE '%complet%'
  LIMIT 1;

  RETURN QUERY
  SELECT 'has_charge_line', o."GUIDOrder"::text, o."OrderNumber"::text, o."OrderStatus"::text,
    jsonb_build_object('misc_charge_type', od."MiscChargeType", 'freight', od."Freight", 'amount', od."Amount")
  FROM public."dbo_Orders" o JOIN public."dbo_OrderDetail" od ON od."GUIDOrder" = o."GUIDOrder"
  WHERE (od."Freight" IS TRUE OR (od."MiscChargeType" IS NOT NULL AND TRIM(od."MiscChargeType") <> ''))
  LIMIT 1;

  RETURN QUERY
  SELECT 'discounted', o."GUIDOrder"::text, o."OrderNumber"::text, o."OrderStatus"::text,
    jsonb_build_object('price', od."Price", 'discount_pct', od."LineDiscountPct", 'amount', od."Amount")
  FROM public."dbo_Orders" o JOIN public."dbo_OrderDetail" od ON od."GUIDOrder" = o."GUIDOrder"
  WHERE COALESCE(od."LineDiscountPct"::numeric,0) > 0
  LIMIT 1;
END;
$$;
GRANT EXECUTE ON FUNCTION public._diag_scenario_orders() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
