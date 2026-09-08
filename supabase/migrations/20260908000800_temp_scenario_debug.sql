CREATE OR REPLACE FUNCTION public._diag_cancelled_orders(p_limit int DEFAULT 5)
RETURNS TABLE (guid_order text, order_number text, order_status text, order_status_desc text, line_count bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT o."GUIDOrder"::text, o."OrderNumber"::text, o."OrderStatus"::text, o."OrderStatusDescription"::text,
    (SELECT COUNT(*) FROM public."dbo_OrderDetail" od WHERE od."GUIDOrder" = o."GUIDOrder")
  FROM public."dbo_Orders" o
  WHERE o."OrderStatusDescription" = 'Cancelled'
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public._diag_cancelled_orders(int) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public._diag_completed_orders(p_limit int DEFAULT 5)
RETURNS TABLE (guid_order text, order_number text, order_status text, order_status_desc text, line_count bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT o."GUIDOrder"::text, o."OrderNumber"::text, o."OrderStatus"::text, o."OrderStatusDescription"::text,
    (SELECT COUNT(*) FROM public."dbo_OrderDetail" od WHERE od."GUIDOrder" = o."GUIDOrder")
  FROM public."dbo_Orders" o
  WHERE o."OrderStatusDescription" = 'Completed'
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public._diag_completed_orders(int) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public._diag_partial_orders(p_limit int DEFAULT 10)
RETURNS TABLE (guid_order text, order_number text, sku text, qty_ordered numeric, qty_shipped numeric)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT od."GUIDOrder"::text, od."OrderNumber"::text, od."ProductID"::text,
    od."QtyOrdered"::numeric, od."QtyShipped"::numeric
  FROM public."dbo_OrderDetail" od
  WHERE COALESCE(od."QtyShipped"::numeric,0) > 0
    AND COALESCE(od."QtyOrdered"::numeric,0) > COALESCE(od."QtyShipped"::numeric,0)
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public._diag_partial_orders(int) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
