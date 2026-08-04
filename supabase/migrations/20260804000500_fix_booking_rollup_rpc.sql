-- Fix kpi_monthly_booking_rollup to use v_portal_bookings_line_facts.
--
-- The old implementation queried dbo_Orders (open) UNION dbo_Invoice (fulfilled)
-- and used qty_ordered × original_price × (1 - pct) for open order amounts.
-- August orders have original_price = NULL → produced $0 bookings.
--
-- The new implementation reads net_booking_amount directly from
-- v_portal_bookings_line_facts, which already applies the corrected COALESCE
-- fallback formula. Branch classification joins dbo_Orders on guid_order.
--
-- Function signature and return type are unchanged.

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
    EXTRACT(YEAR  FROM f.booking_date)::int              AS year,
    EXTRACT(MONTH FROM f.booking_date)::int              AS month,
    COALESCE(SUM(f.net_booking_amount), 0)               AS bookings,
    COUNT(DISTINCT f.guid_order)::int                    AS booking_count,
    COALESCE(SUM(
      CASE WHEN o."BranchID" = 'MIXED'   THEN f.net_booking_amount ELSE 0 END
    ), 0)                                                AS bookings_container,
    COALESCE(SUM(
      CASE WHEN o."BranchID" = 'WHSALES' THEN f.net_booking_amount ELSE 0 END
    ), 0)                                                AS bookings_warehouse
  FROM public.v_portal_bookings_line_facts f
  LEFT JOIN public."dbo_Orders" o
    ON o."GUIDOrder"::text = f.guid_order::text
  LEFT JOIN public.dealers dl
    ON dl.acctivate_id = o."CustomerID"
  WHERE EXTRACT(YEAR FROM f.booking_date)::int = ANY(p_years)
    AND f.booking_date IS NOT NULL
    AND (p_dealer_ids IS NULL OR dl.id = ANY(p_dealer_ids))
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

GRANT EXECUTE ON FUNCTION public.kpi_monthly_booking_rollup(int[], uuid[])
  TO anon, authenticated, service_role;
