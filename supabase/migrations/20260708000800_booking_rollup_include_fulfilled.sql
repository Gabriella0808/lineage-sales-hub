-- Fix bookings to show ALL orders placed in a month, not just currently-open ones.
-- Acctivate removes orders from dbo_Orders once invoiced, so fulfilled orders are
-- only recoverable via dbo_Invoice.OrderDate (the original order date).
--
-- Strategy: UNION
--   (A) open orders    → dbo_Orders + dbo_OrderDetail (remaining open amount)
--   (B) fulfilled orders → dbo_Invoice + dbo_InvoiceDetail (invoiced amount, by OrderDate)
-- For a partially-invoiced order, (A)+(B) = original total booking.

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
  WITH open_orders AS (
    SELECT
      EXTRACT(YEAR  FROM o."OrderDate")::int                                          AS year,
      EXTRACT(MONTH FROM o."OrderDate")::int                                          AS month,
      o."GUIDOrder"                                                                   AS order_guid,
      SUM(od."Amount"::numeric - COALESCE(od."_TariffAmt"::numeric, 0))              AS line_total,
      SUM(CASE WHEN o."BranchID" = 'MIXED'
            THEN od."Amount"::numeric - COALESCE(od."_TariffAmt"::numeric, 0) ELSE 0 END) AS container_total,
      SUM(CASE WHEN o."BranchID" = 'WHSALES'
            THEN od."Amount"::numeric - COALESCE(od."_TariffAmt"::numeric, 0) ELSE 0 END) AS warehouse_total
    FROM public."dbo_Orders" o
    JOIN public."dbo_OrderDetail" od ON od."GUIDOrder" = o."GUIDOrder"
    LEFT JOIN public.dealers dl ON dl.acctivate_id = o."CustomerID"
    WHERE EXTRACT(YEAR FROM o."OrderDate")::int = ANY(p_years)
      AND o."OrderDate" IS NOT NULL
      AND COALESCE(o."OrderStatus", '') NOT ILIKE '%cancel%'
      AND COALESCE(od."Freight",       false) IS NOT TRUE
      AND COALESCE(od."LineCancelled", false) IS NOT TRUE
      AND (od."MiscChargeType" IS NULL OR trim(od."MiscChargeType") = '')
      AND (p_dealer_ids IS NULL OR dl.id = ANY(p_dealer_ids))
    GROUP BY 1, 2, o."GUIDOrder"
  ),
  fulfilled_orders AS (
    SELECT
      EXTRACT(YEAR  FROM i."OrderDate")::int                       AS year,
      EXTRACT(MONTH FROM i."OrderDate")::int                       AS month,
      i."GUIDOrder"                                                AS order_guid,
      SUM(d."Amount"::numeric)                                     AS line_total,
      SUM(CASE WHEN i."GUIDBranch" = 'C96A46A5-7EDC-4B33-AF2E-A0BB16D91320'::uuid
            THEN d."Amount"::numeric ELSE 0 END)                   AS container_total,
      SUM(CASE WHEN i."GUIDBranch" IN (
            'E38CF43B-F51F-45BB-B6F3-862ACFCF951F'::uuid,
            '245DDE60-3911-48EA-9A77-C730843CD8E2'::uuid)
            THEN d."Amount"::numeric ELSE 0 END)                   AS warehouse_total
    FROM public."dbo_Invoice" i
    JOIN public."dbo_InvoiceDetail" d ON d."GUIDInvoice" = i."GUIDInvoice"
    LEFT JOIN public.dealers dl ON dl.acctivate_id = i."CustomerID"
    WHERE EXTRACT(YEAR FROM i."OrderDate")::int = ANY(p_years)
      AND i."OrderDate" IS NOT NULL
      AND COALESCE(d."Freight",       false) IS NOT TRUE
      AND COALESCE(d."LineCancelled", false) IS NOT TRUE
      AND (d."MiscChargeType" IS NULL OR trim(d."MiscChargeType") = '')
      AND (p_dealer_ids IS NULL OR dl.id = ANY(p_dealer_ids))
    GROUP BY 1, 2, i."GUIDOrder", i."GUIDBranch"
  ),
  combined AS (
    SELECT year, month, order_guid, line_total, container_total, warehouse_total FROM open_orders
    UNION ALL
    SELECT year, month, order_guid, line_total, container_total, warehouse_total FROM fulfilled_orders
  )
  SELECT
    year,
    month,
    COALESCE(SUM(line_total),      0) AS bookings,
    COUNT(DISTINCT order_guid)::int   AS booking_count,
    COALESCE(SUM(container_total), 0) AS bookings_container,
    COALESCE(SUM(warehouse_total), 0) AS bookings_warehouse
  FROM combined
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

GRANT EXECUTE ON FUNCTION public.kpi_monthly_booking_rollup(int[], uuid[])
  TO anon, authenticated, service_role;
