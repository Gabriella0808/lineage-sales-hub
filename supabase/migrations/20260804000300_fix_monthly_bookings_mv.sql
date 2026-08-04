-- Fix mv_portal_monthly_net_bookings_actuals to use v_portal_bookings_line_facts.
--
-- Root cause: the old query calculated net_booking_amount as
--   qty_ordered × original_price × (1 - line_discount_pct / 100)
-- August order lines have original_price = NULL → produced $0.
--
-- v_portal_bookings_line_facts already applies the corrected formula:
--   COALESCE(
--     qty_ordered × original_price × (1 - line_discount_pct / 100),
--     amount - tariff_amount - freight_amount
--   ) AS net_booking_amount
--
-- Branch classification joins back to dbo_Orders on guid_order.
--
-- ── Apply in Supabase SQL Editor ─────────────────────────────────────────────
--   1. Paste and run this file.
--   2. The REFRESH at the bottom will re-populate the materialized view.
--      For subsequent refreshes: SELECT refresh_mv_portal_bookings();
-- ─────────────────────────────────────────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS public.mv_portal_monthly_net_bookings_actuals;

CREATE MATERIALIZED VIEW public.mv_portal_monthly_net_bookings_actuals AS
SELECT
  EXTRACT(YEAR  FROM f.booking_date)::int                                             AS year,
  EXTRACT(MONTH FROM f.booking_date)::int                                             AS month_number,
  COALESCE(SUM(f.net_booking_amount), 0)                                              AS net_bookings_actual,
  COALESCE(SUM(
    CASE WHEN o."BranchID" = 'MIXED'   THEN f.net_booking_amount ELSE 0 END
  ), 0)                                                                                AS container_bookings_actual,
  COALESCE(SUM(
    CASE WHEN o."BranchID" = 'WHSALES' THEN f.net_booking_amount ELSE 0 END
  ), 0)                                                                                AS warehouse_bookings_actual
FROM public.v_portal_bookings_line_facts f
LEFT JOIN public."dbo_Orders" o
  ON o."GUIDOrder"::text = f.guid_order::text
WHERE f.booking_date IS NOT NULL
GROUP BY 1, 2
ORDER BY 1, 2
WITH DATA;

-- Unique index required for concurrent refreshes
CREATE UNIQUE INDEX ON public.mv_portal_monthly_net_bookings_actuals (year, month_number);

-- Helper: call to refresh the view after new orders sync
CREATE OR REPLACE FUNCTION public.refresh_mv_portal_bookings()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_portal_monthly_net_bookings_actuals;
$$;

GRANT SELECT ON public.mv_portal_monthly_net_bookings_actuals TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_mv_portal_bookings() TO service_role;
