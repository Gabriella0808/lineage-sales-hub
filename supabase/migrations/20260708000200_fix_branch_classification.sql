-- Fix BranchID classification in both rollup functions.
-- Actual values: WHSALES = warehouse, MIXED = container, DIRECT = direct ship.
-- Previous LIKE '%container%' / LIKE '%warehouse%' matched nothing.

-- 1. Invoice rollup: logic-only fix, return type unchanged → CREATE OR REPLACE is fine.
CREATE OR REPLACE FUNCTION public.kpi_monthly_invoice_rollup(
  p_years      int[],
  p_dealer_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  year               int,
  month              int,
  invoiced           numeric,
  invoiced_container numeric,
  invoiced_warehouse numeric,
  invoice_count      int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH product_lines AS (
    SELECT
      d."GUIDInvoice",
      SUM(d."Amount"::numeric) AS product_subtotal
    FROM public."dbo_InvoiceDetail" d
    WHERE COALESCE(d."Freight",       false) IS NOT TRUE
      AND COALESCE(d."LineCancelled", false) IS NOT TRUE
      AND (d."MiscChargeType" IS NULL OR trim(d."MiscChargeType") = '')
    GROUP BY d."GUIDInvoice"
  )
  SELECT
    EXTRACT(YEAR  FROM i."InvoiceDate")::int AS year,
    EXTRACT(MONTH FROM i."InvoiceDate")::int AS month,
    COALESCE(SUM(pl.product_subtotal), 0)    AS invoiced,
    COALESCE(SUM(CASE WHEN i."BranchID" = 'MIXED'   THEN pl.product_subtotal ELSE 0 END), 0) AS invoiced_container,
    COALESCE(SUM(CASE WHEN i."BranchID" = 'WHSALES' THEN pl.product_subtotal ELSE 0 END), 0) AS invoiced_warehouse,
    COUNT(*)::int AS invoice_count
  FROM public."dbo_Invoice" i
  JOIN product_lines pl ON pl."GUIDInvoice" = i."GUIDInvoice"
  LEFT JOIN public.dealers dl ON dl.acctivate_id = i."CustomerID"
  WHERE EXTRACT(YEAR FROM i."InvoiceDate")::int = ANY(p_years)
    AND i."InvoiceDate" IS NOT NULL
    AND (p_dealer_ids IS NULL OR dl.id = ANY(p_dealer_ids))
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

GRANT EXECUTE ON FUNCTION public.kpi_monthly_invoice_rollup(int[], uuid[])
  TO anon, authenticated, service_role;

-- 2. Booking rollup: adding two new return columns requires DROP + CREATE.
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
    EXTRACT(YEAR  FROM o."OrderDate")::int  AS year,
    EXTRACT(MONTH FROM o."OrderDate")::int  AS month,
    COALESCE(SUM(o."SubTotal"::numeric), 0) AS bookings,
    COUNT(*)::int                           AS booking_count,
    COALESCE(SUM(CASE WHEN o."BranchID" = 'MIXED'   THEN o."SubTotal"::numeric ELSE 0 END), 0) AS bookings_container,
    COALESCE(SUM(CASE WHEN o."BranchID" = 'WHSALES' THEN o."SubTotal"::numeric ELSE 0 END), 0) AS bookings_warehouse
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
