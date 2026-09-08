CREATE OR REPLACE FUNCTION public._diag_sync_freshness()
RETURNS TABLE (
  table_name text, row_count bigint, max_order_date date,
  max_updated_at timestamptz, min_updated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT 'open_sales_orders'::text, COUNT(*)::bigint, MAX(order_date::date),
    MAX(updated_at::timestamptz), MIN(updated_at::timestamptz)
  FROM public.open_sales_orders;

  RETURN QUERY
  SELECT 'acctivate_open_sales_orders'::text, COUNT(*)::bigint, MAX(order_date::date),
    MAX(source_synced_at::timestamptz), MIN(source_synced_at::timestamptz)
  FROM public.acctivate_open_sales_orders;

  RETURN QUERY
  SELECT 'acctivate_open_sales_order_lines'::text, COUNT(*)::bigint, MAX(order_date::date),
    MAX(source_synced_at::timestamptz), MIN(source_synced_at::timestamptz)
  FROM public.acctivate_open_sales_order_lines;

  RETURN QUERY
  SELECT 'dbo_Orders'::text, COUNT(*)::bigint, MAX(o."OrderDate"::date),
    MAX(o."UpdatedDate"::timestamptz), MIN(o."UpdatedDate"::timestamptz)
  FROM public."dbo_Orders" o;
END;
$$;
GRANT EXECUTE ON FUNCTION public._diag_sync_freshness() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
