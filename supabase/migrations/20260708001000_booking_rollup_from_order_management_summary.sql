-- Use dbo_OrderManagementSummary as the bookings source.
-- Unlike dbo_Orders (528 currently-open rows), OrderManagementSummary has ALL
-- orders (open + fulfilled). SubTotal is the product subtotal per order header.

DROP FUNCTION IF EXISTS public.kpi_monthly_booking_rollup(int[], uuid[]);

CREATE FUNCTION public.kpi_monthly_booking_rollup(
  p_years      int[],
  p_dealer_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  year               int,
  month              int,
  bookings           numeric,
  booking_count      int,
  bookings_container numeric,
  bookings_warehouse numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXTRACT(YEAR  FROM o."OrderDate")::int                                                         AS year,
    EXTRACT(MONTH FROM o."OrderDate")::int                                                         AS month,
    COALESCE(SUM(o."SubTotal"::numeric), 0)                                                        AS bookings,
    COUNT(DISTINCT o."GUIDOrder")::int                                                             AS booking_count,
    COALESCE(SUM(CASE WHEN o."BranchID" = 'MIXED'   THEN o."SubTotal"::numeric ELSE 0 END), 0)   AS bookings_container,
    COALESCE(SUM(CASE WHEN o."BranchID" = 'WHSALES' THEN o."SubTotal"::numeric ELSE 0 END), 0)   AS bookings_warehouse
  FROM public."dbo_OrderManagementSummary" o
  LEFT JOIN public.dealers dl ON dl.acctivate_id = o."CustomerID"
  WHERE EXTRACT(YEAR FROM o."OrderDate")::int = ANY(p_years)
    AND o."OrderDate" IS NOT NULL
    AND COALESCE(o."OrderStatus", '') NOT ILIKE '%cancel%'
    AND (p_dealer_ids IS NULL OR dl.id = ANY(p_dealer_ids))
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

GRANT EXECUTE ON FUNCTION public.kpi_monthly_booking_rollup(int[], uuid[])
  TO anon, authenticated, service_role;
