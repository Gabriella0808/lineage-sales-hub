-- High-Level Reporting's "Data updated [time]" line was showing when the
-- browser last fetched its query cache (react-query's dataUpdatedAt), not
-- when the underlying Acctivate data was actually last synced - those can
-- differ by a lot (e.g. someone leaves the tab open overnight).
--
-- Traced the real live data sources (not the frozen-at-2026-07-08 legacy
-- dbo_Orders/dbo_Invoice import snapshot, which is no longer the active
-- pipeline):
--   - Bookings AND Open SOs both come from portal_acctivate_orders /
--     portal_acctivate_order_lines (v_portal_bookings_line_facts and
--     v_portal_open_sales_order_line_facts both join from there) - one
--     shared synced_at covers both.
--   - Invoices come from acctivate_invoice_lines_2026_direct
--     (v_portal_invoice_line_facts), which has its own source_synced_at.
--
-- Returns the MIN of the two - the most recent point at which bookings,
-- invoiced AND open SOs are all guaranteed to be at least that fresh,
-- rather than the max, which would overstate freshness for whichever
-- source happened to sync later.
CREATE OR REPLACE FUNCTION public.get_portal_data_sync_status()
RETURNS TABLE(bookings_and_open_so_synced_at timestamptz, invoices_synced_at timestamptz, last_synced_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    b.synced_at,
    i.synced_at,
    LEAST(b.synced_at, i.synced_at)
  FROM
    (SELECT max(synced_at) AS synced_at FROM public.portal_acctivate_orders) b,
    (SELECT max(source_synced_at) AS synced_at FROM public.acctivate_invoice_lines_2026_direct) i;
$$;

GRANT EXECUTE ON FUNCTION public.get_portal_data_sync_status() TO authenticated;
