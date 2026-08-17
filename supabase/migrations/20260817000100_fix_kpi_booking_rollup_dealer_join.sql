-- Fix kpi_monthly_booking_rollup dealer filtering and branch classification.
--
-- Root cause: two separate problems combined:
--
-- 1. Migration 20260804000500 used:
--      LEFT JOIN dbo_Orders o ON o."GUIDOrder"::text = f.guid_order::text
--    dbo_Orders."GUIDOrder" is braced GUID {XXXXXXXX-...} while
--    v_portal_bookings_line_facts.guid_order is plain UUID, so the join
--    always returns NULL → dl.id = NULL → dealer filter drops all rows.
--
-- 2. The previous fix attempt (000100) replaced dbo_Orders with
--    booking_orders_sync. But booking_orders_sync was loaded via a one-time
--    SSMS CSV import and is not fully up-to-date — August 2026 orders are
--    missing. When bos is NULL for those rows, dl is also NULL and the dealer
--    filter still drops them.
--
-- Final fix:
--   - Dealer lookup: use dbo_Orders with braced-GUID comparison fixed
--     (TRIM '{' '}' from dbo_Orders."GUIDOrder" before comparing) — dbo_Orders
--     is the live Acctivate table and always has current data.
--   - Branch classification: prefer booking_orders_sync.branch_id (populated
--     via SSMS/Skyvia) and fall back to dbo_Orders."BranchID" for rows where
--     bos is NULL (recent orders not yet synced).
--   - Booking amounts: unchanged — still from v_portal_bookings_line_facts.
--
-- Do not change: totals, mat views, invoiced data, 2025 actuals, projections.

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
      CASE WHEN COALESCE(bos.branch_id, o."BranchID") = 'MIXED'
           THEN f.net_booking_amount ELSE 0 END
    ), 0)                                                AS bookings_container,
    COALESCE(SUM(
      CASE WHEN COALESCE(bos.branch_id, o."BranchID") = 'WHSALES'
           THEN f.net_booking_amount ELSE 0 END
    ), 0)                                                AS bookings_warehouse
  FROM public.v_portal_bookings_line_facts f
  -- Fix the braced-GUID mismatch: dbo_Orders stores {XXXXXXXX-...}, strip braces before comparing.
  LEFT JOIN public."dbo_Orders" o
    ON TRIM(BOTH '{}' FROM LOWER(o."GUIDOrder"::text)) = LOWER(f.guid_order)
  -- Branch classification from booking_orders_sync where available (already has MIXED/WHSALES).
  -- Falls back to dbo_Orders."BranchID" via COALESCE above for rows not yet synced.
  LEFT JOIN public.booking_orders_sync bos
    ON bos.guid_order = f.guid_order::uuid
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

-- Verification — run after applying this migration:
/*
-- Should return non-zero bookings when filtering to a specific dealer's UUID:
-- SELECT * FROM kpi_monthly_booking_rollup(ARRAY[2026], ARRAY['<dealer-uuid>'::uuid]);

-- Company-wide (p_dealer_ids = NULL) should be unchanged:
SELECT year, month, bookings, bookings_container, bookings_warehouse
FROM kpi_monthly_booking_rollup(ARRAY[2025, 2026])
ORDER BY year, month;
*/
