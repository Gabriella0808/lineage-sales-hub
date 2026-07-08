-- Booking rollup: open orders (dbo_Orders) UNION fulfilled orders (dbo_Invoice by OrderDate).
-- This gives all orders placed in a month regardless of fulfillment status.
-- Both sources exclude tariffs/surcharges (MiscChargeType) and freight.
--
-- IMPORTANT: For historical bookings to appear, dbo_Invoice.OrderDate must be populated.
-- Trigger a one-time full Invoice re-sync: on the Lightsail VM, delete
-- C:\sync\last_sync.json and let Task Scheduler run the sync script again.

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
    -- Currently-open orders: product lines only, tariffs/freight excluded
    SELECT
      EXTRACT(YEAR  FROM o."OrderDate")::int                                                        AS yr,
      EXTRACT(MONTH FROM o."OrderDate")::int                                                        AS mo,
      o."GUIDOrder"                                                                                 AS order_id,
      SUM(d."AmountOrdered"::numeric)                                                               AS line_total,
      SUM(CASE WHEN o."BranchID" = 'MIXED'   THEN d."AmountOrdered"::numeric ELSE 0 END)          AS container_amt,
      SUM(CASE WHEN o."BranchID" = 'WHSALES' THEN d."AmountOrdered"::numeric ELSE 0 END)          AS warehouse_amt
    FROM public."dbo_Orders" o
    JOIN public."dbo_OrderDetail" d ON d."GUIDOrder" = o."GUIDOrder"
    LEFT JOIN public.dealers dl ON dl.acctivate_id = o."CustomerID"
    WHERE EXTRACT(YEAR FROM o."OrderDate")::int = ANY(p_years)
      AND o."OrderDate" IS NOT NULL
      AND COALESCE(o."OrderStatus", '') NOT ILIKE '%cancel%'
      AND COALESCE(d."MiscChargeType", '') = ''
      AND COALESCE(d."Freight", false) IS NOT TRUE
      AND (p_dealer_ids IS NULL OR dl.id = ANY(p_dealer_ids))
    GROUP BY 1, 2, o."GUIDOrder", o."BranchID"
  ),
  fulfilled_orders AS (
    -- Fulfilled orders: use original OrderDate (booking date), product lines only
    SELECT
      EXTRACT(YEAR  FROM i."OrderDate")::int                                                        AS yr,
      EXTRACT(MONTH FROM i."OrderDate")::int                                                        AS mo,
      i."GUIDOrder"                                                                                 AS order_id,
      SUM(d."Amount"::numeric)                                                                      AS line_total,
      SUM(CASE WHEN i."GUIDBranch" = 'C96A46A5-7EDC-4B33-AF2E-A0BB16D91320'::uuid
               THEN d."Amount"::numeric ELSE 0 END)                                                AS container_amt,
      SUM(CASE WHEN i."GUIDBranch" IN (
               'E38CF43B-F51F-45BB-B6F3-862ACFCF951F'::uuid,
               '245DDE60-3911-48EA-9A77-C730843CD8E2'::uuid)
               THEN d."Amount"::numeric ELSE 0 END)                                                AS warehouse_amt
    FROM public."dbo_Invoice" i
    JOIN public."dbo_InvoiceDetail" d ON d."GUIDInvoice" = i."GUIDInvoice"
    LEFT JOIN public.dealers dl ON dl.acctivate_id = i."CustomerID"
    WHERE EXTRACT(YEAR FROM i."OrderDate")::int = ANY(p_years)
      AND i."OrderDate" IS NOT NULL
      AND COALESCE(d."Freight", false) IS NOT TRUE
      AND COALESCE(d."LineCancelled", false) IS NOT TRUE
      AND (d."MiscChargeType" IS NULL OR trim(d."MiscChargeType") = '')
      AND (p_dealer_ids IS NULL OR dl.id = ANY(p_dealer_ids))
    GROUP BY 1, 2, i."GUIDOrder"
  ),
  all_orders AS (
    SELECT yr, mo, order_id, line_total, container_amt, warehouse_amt FROM open_orders
    UNION ALL
    SELECT yr, mo, order_id, line_total, container_amt, warehouse_amt FROM fulfilled_orders
  )
  SELECT
    yr                                 AS year,
    mo                                 AS month,
    COALESCE(SUM(line_total),    0)    AS bookings,
    COUNT(DISTINCT order_id)::int      AS booking_count,
    COALESCE(SUM(container_amt), 0)    AS bookings_container,
    COALESCE(SUM(warehouse_amt), 0)    AS bookings_warehouse
  FROM all_orders
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

GRANT EXECUTE ON FUNCTION public.kpi_monthly_booking_rollup(int[], uuid[])
  TO anon, authenticated, service_role;
