CREATE OR REPLACE FUNCTION public._diag_price_field_check(p_limit int DEFAULT 20)
RETURNS TABLE (
  order_number text, sku text, price numeric, original_price numeric,
  qty_ordered numeric, line_discount_pct numeric, amount numeric,
  price_x_qty_disc numeric, orig_price_x_qty_disc numeric
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    od."OrderNumber"::text, od."ProductID"::text,
    od."Price"::numeric, od."_OriginalPrice"::numeric,
    od."QtyOrdered"::numeric, od."LineDiscountPct"::numeric, od."Amount"::numeric,
    ROUND(od."Price"::numeric * od."QtyOrdered"::numeric * (1 - COALESCE(od."LineDiscountPct"::numeric,0)/100.0), 2),
    ROUND(od."_OriginalPrice"::numeric * od."QtyOrdered"::numeric * (1 - COALESCE(od."LineDiscountPct"::numeric,0)/100.0), 2)
  FROM public."dbo_OrderDetail" od
  WHERE od."Price"::numeric IS DISTINCT FROM od."_OriginalPrice"::numeric
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public._diag_price_field_check(int) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public._diag_price_field_match_stats()
RETURNS TABLE (total_lines bigint, price_eq_origprice bigint, price_null bigint, origprice_null bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE od."Price"::numeric IS NOT DISTINCT FROM od."_OriginalPrice"::numeric),
    COUNT(*) FILTER (WHERE od."Price" IS NULL),
    COUNT(*) FILTER (WHERE od."_OriginalPrice" IS NULL)
  FROM public."dbo_OrderDetail" od;
$$;
GRANT EXECUTE ON FUNCTION public._diag_price_field_match_stats() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
