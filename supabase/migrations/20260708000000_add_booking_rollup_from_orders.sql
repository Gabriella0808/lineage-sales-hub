-- Replace dealer_sales bookings with a live rollup from dbo_Orders.
-- dbo_Orders is synced nightly from Acctivate via the Python sync script.

-- Drop first so we can change the return-type signature (CREATE OR REPLACE
-- cannot alter return types in Postgres).
DROP FUNCTION IF EXISTS public.kpi_monthly_booking_rollup(int[], uuid[]);

CREATE OR REPLACE FUNCTION public.kpi_monthly_booking_rollup(
  p_years      int[],
  p_dealer_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  year          int,
  month         int,
  bookings      numeric,
  booking_count int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXTRACT(YEAR  FROM o."OrderDate")::int  AS year,
    EXTRACT(MONTH FROM o."OrderDate")::int  AS month,
    COALESCE(SUM(o."SubTotal"::numeric), 0) AS bookings,
    COUNT(*)::int                           AS booking_count
  FROM public."dbo_Orders" o
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
