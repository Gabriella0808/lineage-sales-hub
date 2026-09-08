CREATE OR REPLACE FUNCTION public._diag_order_line_dup_check(p_guid_order text)
RETURNS TABLE (
  raw_orderdetail_rows bigint, distinct_guid_order_detail bigint, distinct_sku bigint,
  raw_orders_header_rows bigint, distinct_dealer_matches bigint, distinct_asr_matches bigint, distinct_realrep_matches bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE
  v_customer_id text;
  v_salesperson_id text;
BEGIN
  SELECT o."CustomerID"::text, o."SalespersonID" INTO v_customer_id, v_salesperson_id
  FROM public."dbo_Orders" o WHERE LOWER(REPLACE(REPLACE(o."GUIDOrder"::text,'{',''),'}','')) = p_guid_order LIMIT 1;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public."dbo_OrderDetail" od WHERE LOWER(REPLACE(REPLACE(od."GUIDOrder"::text,'{',''),'}','')) = p_guid_order),
    (SELECT COUNT(DISTINCT od."GUIDOrderDetail") FROM public."dbo_OrderDetail" od WHERE LOWER(REPLACE(REPLACE(od."GUIDOrder"::text,'{',''),'}','')) = p_guid_order),
    (SELECT COUNT(DISTINCT od."ProductID") FROM public."dbo_OrderDetail" od WHERE LOWER(REPLACE(REPLACE(od."GUIDOrder"::text,'{',''),'}','')) = p_guid_order),
    (SELECT COUNT(*) FROM public."dbo_Orders" o WHERE LOWER(REPLACE(REPLACE(o."GUIDOrder"::text,'{',''),'}','')) = p_guid_order),
    (SELECT COUNT(*) FROM public.dealers dl WHERE dl.acctivate_id = v_customer_id),
    (SELECT COUNT(*) FROM public.acctivate_sales_reps asr WHERE LOWER(TRIM(asr.acctivate_id)) = LOWER(TRIM(v_salesperson_id))),
    (SELECT COUNT(*) FROM public.sales_reps sr WHERE LOWER(TRIM(sr.acctivate_id)) = LOWER(TRIM(v_salesperson_id)));
END;
$$;
GRANT EXECUTE ON FUNCTION public._diag_order_line_dup_check(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public._diag_raw_order_detail_rows(p_guid_order text)
RETURNS TABLE (guid_order_detail text, sku text, qty_ordered numeric, line_number text, sub_line_number text, component_level text)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT od."GUIDOrderDetail"::text, od."ProductID"::text, od."QtyOrdered"::numeric,
    od."LineNumber"::text, od."SubLineNumber"::text, od."ComponentLevel"::text
  FROM public."dbo_OrderDetail" od
  WHERE LOWER(REPLACE(REPLACE(od."GUIDOrder"::text,'{',''),'}','')) = p_guid_order
  ORDER BY od."LineNumber", od."SubLineNumber";
$$;
GRANT EXECUTE ON FUNCTION public._diag_raw_order_detail_rows(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
