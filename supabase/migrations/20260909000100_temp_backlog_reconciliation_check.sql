CREATE OR REPLACE FUNCTION public._diag_backlog_vs_open_so()
RETURNS TABLE (
  source text, row_count bigint, distinct_orders bigint,
  total_units numeric, total_value numeric, max_order_date date, max_touch timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
BEGIN
  RETURN QUERY
  SELECT 'open_sales_orders (Inventory > Backlog source)'::text,
    COUNT(*)::bigint, COUNT(DISTINCT order_number)::bigint,
    COALESCE(SUM(qty_open::numeric),0), COALESCE(SUM(extended_value::numeric),0),
    MAX(order_date::date), MAX(updated_at::timestamptz)
  FROM public.open_sales_orders;

  RETURN QUERY
  SELECT 'v_portal_open_sales_order_line_facts (Dealer/Rep Open SO card)'::text,
    COUNT(*)::bigint, COUNT(DISTINCT order_number)::bigint,
    COALESCE(SUM(qty_open),0), COALESCE(SUM(open_so_amount),0),
    MAX(order_date), NULL::timestamptz
  FROM public.v_portal_open_sales_order_line_facts;
END;
$$;
GRANT EXECUTE ON FUNCTION public._diag_backlog_vs_open_so() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
