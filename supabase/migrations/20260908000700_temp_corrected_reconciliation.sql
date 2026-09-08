-- Corrected reconciliation: uses OrderStatusDescription (not the coded
-- OrderStatus letter) for the header-open check, and SalesCategory (not the
-- always-null MiscChargeType) for the charge-line exclusion, per the schema
-- facts discovered during validation.
CREATE OR REPLACE FUNCTION public._diag_rep_reconciliation_v2(p_rep_ids text[])
RETURNS TABLE (
  rep_id text, order_count bigint, line_count bigint, total_open_value numeric
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    COALESCE(NULLIF(TRIM(o."SalespersonID"), ''), NULLIF(TRIM(o."_Rep1"), ''), '')::text AS rep_id,
    COUNT(DISTINCT o."OrderNumber")::bigint AS order_count,
    COUNT(*)::bigint AS line_count,
    ROUND(SUM(
      od."Price"::numeric * (1 - COALESCE(od."LineDiscountPct"::numeric,0)/100.0)
      * GREATEST(COALESCE(od."QtyOrdered"::numeric,0) - COALESCE(od."QtyShipped"::numeric,0), 0)
    ), 2) AS total_open_value
  FROM public."dbo_Orders" o
  JOIN public."dbo_OrderDetail" od ON od."GUIDOrder" = o."GUIDOrder"
  WHERE o."OrderDate" IS NOT NULL
    AND COALESCE(o."OrderStatusDescription", '') NOT ILIKE '%cancel%'
    AND COALESCE(o."OrderStatusDescription", '') NOT ILIKE '%complet%'
    AND COALESCE(o."OrderStatusDescription", '') NOT ILIKE '%void%'
    AND COALESCE(o."OrderStatusDescription", '') NOT ILIKE '%closed%'
    AND COALESCE(od."Freight", false) IS NOT TRUE
    AND COALESCE(od."LineCancelled", false) IS NOT TRUE
    AND COALESCE(od."SalesCategory", '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF')
    AND (COALESCE(od."QtyOrdered"::numeric,0) - COALESCE(od."QtyShipped"::numeric,0)) > 0
    AND COALESCE(NULLIF(TRIM(o."SalespersonID"), ''), NULLIF(TRIM(o."_Rep1"), ''), '') = ANY(p_rep_ids)
  GROUP BY 1
  ORDER BY 4 DESC;
$$;
GRANT EXECUTE ON FUNCTION public._diag_rep_reconciliation_v2(text[]) TO anon, authenticated;

-- Same as v1 but using DISTINCT OrderNumber (not GUIDOrder) for the count,
-- to check whether OrderNumber and GUIDOrder ever diverge (e.g. one order
-- number reused across multiple GUIDOrder rows, or vice versa).
CREATE OR REPLACE FUNCTION public._diag_order_count_check(p_rep_ids text[])
RETURNS TABLE (
  rep_id text, distinct_guid_order bigint, distinct_order_number bigint
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    COALESCE(NULLIF(TRIM(o."SalespersonID"), ''), NULLIF(TRIM(o."_Rep1"), ''), '')::text AS rep_id,
    COUNT(DISTINCT o."GUIDOrder")::bigint,
    COUNT(DISTINCT o."OrderNumber")::bigint
  FROM public."dbo_Orders" o
  JOIN public."dbo_OrderDetail" od ON od."GUIDOrder" = o."GUIDOrder"
  WHERE o."OrderDate" IS NOT NULL
    AND COALESCE(o."OrderStatusDescription", '') NOT ILIKE '%cancel%'
    AND COALESCE(o."OrderStatusDescription", '') NOT ILIKE '%complet%'
    AND COALESCE(o."OrderStatusDescription", '') NOT ILIKE '%void%'
    AND COALESCE(o."OrderStatusDescription", '') NOT ILIKE '%closed%'
    AND COALESCE(od."Freight", false) IS NOT TRUE
    AND COALESCE(od."LineCancelled", false) IS NOT TRUE
    AND COALESCE(od."SalesCategory", '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF')
    AND (COALESCE(od."QtyOrdered"::numeric,0) - COALESCE(od."QtyShipped"::numeric,0)) > 0
    AND COALESCE(NULLIF(TRIM(o."SalespersonID"), ''), NULLIF(TRIM(o."_Rep1"), ''), '') = ANY(p_rep_ids)
  GROUP BY 1;
$$;
GRANT EXECUTE ON FUNCTION public._diag_order_count_check(text[]) TO anon, authenticated;

-- Brand-filtered check: for a rep, total value + distinct order count when
-- filtered to a single brand, vs unfiltered — to confirm the dollar total
-- drops to just that brand's lines while distinct order count still reflects
-- orders containing at least one matching line (not a per-brand order count).
CREATE OR REPLACE FUNCTION public._diag_brand_filter_check(p_rep_id text)
RETURNS TABLE (
  brand_category text, order_count bigint, line_count bigint, total_open_value numeric
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    COALESCE(
      CASE
        WHEN od."SalesCategory" = 'SW' THEN 'Sea Winds'
        WHEN od."SalesCategory" IN ('FL','FINNLOU') THEN 'Finn & Lou'
        WHEN UPPER(COALESCE(od."SalesCategory",'')) = 'LUX' THEN 'Lux'
        WHEN od."SalesCategory" = 'ALLOW' OR COALESCE(od."SalesCategory",'') = '' THEN 'ALLOW'
        ELSE NULL
      END, '(excluded/other)'
    ) AS brand_category,
    COUNT(DISTINCT o."OrderNumber")::bigint,
    COUNT(*)::bigint,
    ROUND(SUM(
      od."Price"::numeric * (1 - COALESCE(od."LineDiscountPct"::numeric,0)/100.0)
      * GREATEST(COALESCE(od."QtyOrdered"::numeric,0) - COALESCE(od."QtyShipped"::numeric,0), 0)
    ), 2)
  FROM public."dbo_Orders" o
  JOIN public."dbo_OrderDetail" od ON od."GUIDOrder" = o."GUIDOrder"
  WHERE o."OrderDate" IS NOT NULL
    AND COALESCE(o."OrderStatusDescription", '') NOT ILIKE '%cancel%'
    AND COALESCE(o."OrderStatusDescription", '') NOT ILIKE '%complet%'
    AND COALESCE(o."OrderStatusDescription", '') NOT ILIKE '%void%'
    AND COALESCE(o."OrderStatusDescription", '') NOT ILIKE '%closed%'
    AND COALESCE(od."Freight", false) IS NOT TRUE
    AND COALESCE(od."LineCancelled", false) IS NOT TRUE
    AND COALESCE(od."SalesCategory", '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF')
    AND (COALESCE(od."QtyOrdered"::numeric,0) - COALESCE(od."QtyShipped"::numeric,0)) > 0
    AND COALESCE(NULLIF(TRIM(o."SalespersonID"), ''), NULLIF(TRIM(o."_Rep1"), ''), '') = p_rep_id
  GROUP BY 1
  ORDER BY 4 DESC;
$$;
GRANT EXECUTE ON FUNCTION public._diag_brand_filter_check(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
