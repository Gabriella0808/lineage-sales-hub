CREATE OR REPLACE FUNCTION public._diag_qty_survey()
RETURNS TABLE (
  order_status text,
  lines bigint,
  lines_with_qty_shipped_gt0 bigint,
  lines_with_qty_invoiced_gt0 bigint,
  lines_with_qty_backordered_gt0 bigint,
  sum_qty_ordered numeric,
  sum_qty_shipped numeric,
  sum_qty_invoiced numeric,
  sum_qty_backordered numeric
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    o."OrderStatusDescription"::text,
    COUNT(*),
    COUNT(*) FILTER (WHERE COALESCE(od."QtyShipped"::numeric,0) > 0),
    COUNT(*) FILTER (WHERE COALESCE(od."QtyInvoiced"::numeric,0) > 0),
    COUNT(*) FILTER (WHERE COALESCE(od."QtyBackordered"::numeric,0) > 0),
    SUM(COALESCE(od."QtyOrdered"::numeric,0)),
    SUM(COALESCE(od."QtyShipped"::numeric,0)),
    SUM(COALESCE(od."QtyInvoiced"::numeric,0)),
    SUM(COALESCE(od."QtyBackordered"::numeric,0))
  FROM public."dbo_OrderDetail" od
  JOIN public."dbo_Orders" o ON o."GUIDOrder" = od."GUIDOrder"
  GROUP BY o."OrderStatusDescription"
  ORDER BY 2 DESC;
$$;
GRANT EXECUTE ON FUNCTION public._diag_qty_survey() TO anon, authenticated;

-- Sample of Completed-order lines, to see what a fulfilled line actually looks like
CREATE OR REPLACE FUNCTION public._diag_completed_sample(p_limit int DEFAULT 10)
RETURNS TABLE (
  order_number text, sku text, qty_ordered numeric, qty_shipped numeric,
  qty_invoiced numeric, qty_backordered numeric, price numeric, amount numeric
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT od."OrderNumber"::text, od."ProductID"::text,
    od."QtyOrdered"::numeric, od."QtyShipped"::numeric, od."QtyInvoiced"::numeric, od."QtyBackordered"::numeric,
    od."Price"::numeric, od."Amount"::numeric
  FROM public."dbo_OrderDetail" od
  JOIN public."dbo_Orders" o ON o."GUIDOrder" = od."GUIDOrder"
  WHERE o."OrderStatusDescription" = 'Completed'
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public._diag_completed_sample(int) TO anon, authenticated;

-- Sample of Backordered-order lines (K) — these should represent genuine partial/remaining backlog
CREATE OR REPLACE FUNCTION public._diag_backordered_sample(p_limit int DEFAULT 20)
RETURNS TABLE (
  order_number text, sku text, qty_ordered numeric, qty_shipped numeric,
  qty_invoiced numeric, qty_backordered numeric, price numeric, amount numeric
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT od."OrderNumber"::text, od."ProductID"::text,
    od."QtyOrdered"::numeric, od."QtyShipped"::numeric, od."QtyInvoiced"::numeric, od."QtyBackordered"::numeric,
    od."Price"::numeric, od."Amount"::numeric
  FROM public."dbo_OrderDetail" od
  JOIN public."dbo_Orders" o ON o."GUIDOrder" = od."GUIDOrder"
  WHERE o."OrderStatusDescription" = 'Backordered'
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public._diag_backordered_sample(int) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
