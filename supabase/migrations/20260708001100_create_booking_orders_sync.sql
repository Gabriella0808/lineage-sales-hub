-- Dedicated table for order-level booking data synced from Acctivate.
-- Populated via one-time SSMS CSV import + ongoing Skyvia UPSERT by guid_order.
-- kpi_monthly_booking_rollup reads from this table (not dbo_OrderManagementSummary).

CREATE TABLE IF NOT EXISTS public.booking_orders_sync (
  guid_order   uuid        PRIMARY KEY,
  customer_id  text,
  branch_id    text,
  order_date   date,
  order_status text,
  sub_total    numeric(18,2),
  synced_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.booking_orders_sync ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read booking_orders_sync" ON public.booking_orders_sync;
CREATE POLICY "Authenticated read booking_orders_sync"
  ON public.booking_orders_sync
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_booking_orders_sync_date
  ON public.booking_orders_sync (order_date);

CREATE INDEX IF NOT EXISTS idx_booking_orders_sync_customer
  ON public.booking_orders_sync (customer_id);

-- Update booking rollup to read from booking_orders_sync.
-- This table has all orders (open + fulfilled) once populated from SSMS.
-- Ongoing: Skyvia should UPSERT to this table by guid_order on each sync run.

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
    EXTRACT(YEAR  FROM b.order_date)::int                                                         AS year,
    EXTRACT(MONTH FROM b.order_date)::int                                                         AS month,
    COALESCE(SUM(b.sub_total), 0)                                                                 AS bookings,
    COUNT(DISTINCT b.guid_order)::int                                                             AS booking_count,
    COALESCE(SUM(CASE WHEN b.branch_id = 'MIXED'   THEN b.sub_total ELSE 0 END), 0)             AS bookings_container,
    COALESCE(SUM(CASE WHEN b.branch_id = 'WHSALES' THEN b.sub_total ELSE 0 END), 0)             AS bookings_warehouse
  FROM public.booking_orders_sync b
  LEFT JOIN public.dealers dl ON dl.acctivate_id = b.customer_id
  WHERE EXTRACT(YEAR FROM b.order_date)::int = ANY(p_years)
    AND b.order_date IS NOT NULL
    AND COALESCE(b.order_status, '') NOT ILIKE '%cancel%'
    AND (p_dealer_ids IS NULL OR dl.id = ANY(p_dealer_ids))
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

GRANT EXECUTE ON FUNCTION public.kpi_monthly_booking_rollup(int[], uuid[])
  TO anon, authenticated, service_role;
