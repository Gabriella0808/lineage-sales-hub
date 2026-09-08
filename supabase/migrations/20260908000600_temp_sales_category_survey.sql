CREATE OR REPLACE FUNCTION public._diag_sales_category_survey()
RETURNS TABLE (
  sales_category text, cnt bigint, freight_true_cnt bigint,
  cnt_open_by_qty bigint, sum_amount_if_open numeric, sample_product_id text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    COALESCE(NULLIF(TRIM(od."SalesCategory"::text), ''), '(blank)'),
    COUNT(*),
    COUNT(*) FILTER (WHERE od."Freight" IS TRUE),
    COUNT(*) FILTER (WHERE COALESCE(od."QtyOrdered"::numeric,0) - COALESCE(od."QtyShipped"::numeric,0) > 0),
    SUM(CASE WHEN COALESCE(od."QtyOrdered"::numeric,0) - COALESCE(od."QtyShipped"::numeric,0) > 0
             THEN od."Amount"::numeric ELSE 0 END),
    MIN(od."ProductID"::text)
  FROM public."dbo_OrderDetail" od
  GROUP BY 1
  ORDER BY 2 DESC;
$$;
GRANT EXECUTE ON FUNCTION public._diag_sales_category_survey() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
