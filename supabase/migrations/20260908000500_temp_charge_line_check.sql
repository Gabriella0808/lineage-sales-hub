CREATE OR REPLACE FUNCTION public._diag_charge_sku_check()
RETURNS TABLE (
  sku_pattern text, product_id text, misc_charge_type text, freight boolean,
  line_cancelled boolean, sales_category text, cnt bigint,
  cnt_open_by_qty bigint, sum_amount_if_open numeric
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    CASE
      WHEN od."ProductID" ILIKE 'Freight%' THEN 'Freight*'
      WHEN od."ProductID" ILIKE '%Tariff%' THEN '*Tariff*'
      WHEN od."ProductID" ILIKE '%Customs%' OR od."ProductID" ILIKE '%Pass-Through%' THEN '*Customs/PassThrough*'
      WHEN od."ProductID" ILIKE '%Surcharge%' THEN '*Surcharge*'
      WHEN od."ProductID" ILIKE '%Drayage%' THEN '*Drayage*'
      WHEN od."ProductID" ILIKE '%QC%' THEN '*QC*'
      ELSE 'other'
    END AS sku_pattern,
    od."ProductID"::text,
    od."MiscChargeType"::text,
    od."Freight",
    od."LineCancelled",
    od."SalesCategory"::text,
    COUNT(*),
    COUNT(*) FILTER (WHERE COALESCE(od."QtyOrdered"::numeric,0) - COALESCE(od."QtyShipped"::numeric,0) > 0),
    SUM(CASE WHEN COALESCE(od."QtyOrdered"::numeric,0) - COALESCE(od."QtyShipped"::numeric,0) > 0
             THEN od."Amount"::numeric ELSE 0 END)
  FROM public."dbo_OrderDetail" od
  WHERE od."ProductID" ILIKE 'Freight%' OR od."ProductID" ILIKE '%Tariff%'
     OR od."ProductID" ILIKE '%Customs%' OR od."ProductID" ILIKE '%Pass-Through%'
     OR od."ProductID" ILIKE '%Surcharge%' OR od."ProductID" ILIKE '%Drayage%'
     OR od."ProductID" ILIKE '%QC%'
  GROUP BY 1,2,3,4,5,6
  ORDER BY 7 DESC;
$$;
GRANT EXECUTE ON FUNCTION public._diag_charge_sku_check() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
