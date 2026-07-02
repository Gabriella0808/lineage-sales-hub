DO $wrap$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'dbo_Orders') THEN
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.bookings_all_in_range(p_from date, p_to date)
      RETURNS TABLE(dealer_id uuid, dealer_acctivate_id text, order_date date, extended_value numeric)
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
      AS $$
        SELECT
          d.id AS dealer_id,
          c."CustId"::text AS dealer_acctivate_id,
          o."OrderDate"::date AS order_date,
          COALESCE(o."SubTotal"::numeric, 0) AS extended_value
        FROM public."dbo_Orders" o
        LEFT JOIN public."dbo_Customer" c ON c."GUIDCustomer" = o."GUIDCustomer"
        LEFT JOIN public.dealers d ON upper(d.acctivate_id) = upper(c."CustId"::text)
        WHERE o."OrderDate"::date BETWEEN p_from AND p_to;
      $$
    $f$;
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.bookings_all_in_range(date, date) TO authenticated, anon';
  ELSE
    RAISE NOTICE 'Skipping bookings_all_in_range: dbo_Orders table not found (Acctivate FDW not set up)';
  END IF;
END $wrap$;