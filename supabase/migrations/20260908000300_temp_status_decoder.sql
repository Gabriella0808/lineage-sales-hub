CREATE OR REPLACE FUNCTION public._diag_status_decoder()
RETURNS TABLE (order_status text, order_status_description text, cnt bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT o."OrderStatus"::text, o."OrderStatusDescription"::text, COUNT(*)
  FROM public."dbo_Orders" o
  GROUP BY o."OrderStatus", o."OrderStatusDescription"
  ORDER BY 3 DESC;
$$;
GRANT EXECUTE ON FUNCTION public._diag_status_decoder() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
