-- ══════════════════════════════════════════════════════════════════════════════
-- Fix Kloss Furniture specifically (scoped, single-row, narrow fix per
-- explicit instruction - NOT a bulk fix for the broader 377-dealer
-- GUID-acctivate_id issue, which is diagnostic-only for now).
--
-- Root cause (confirmed via diagnostic in the prior turn):
--   1. dealers.acctivate_id = '65a5eb0f-b7d6-4382-b8bc-f74da26eabe3' (a
--      GUID unrelated to Acctivate's own GUIDCustomer for Kloss, and not
--      matching the readable customer_id 'Kloss Furniture' used by
--      bookings) - the dealer roster join could never match Kloss's real
--      bookings.
--   2. dealers.salesperson and dealers.territory were both NULL - the
--      roster CTE in get_sales_reporting_grouped_rows requires at least
--      one to be non-blank, so Kloss was excluded from the roster
--      entirely regardless of issue 1.
--
-- Fix, targeted by dealers.id (not name, to avoid any risk of matching
-- more than one row):
--   - acctivate_id -> 'Kloss Furniture' (matches bookings customer_id
--     exactly; confirmed no other dealer already uses this value, and
--     dealers.acctivate_id has a UNIQUE constraint so this is safe)
--   - salesperson  -> 'House' (matches the rep name convention already
--     used on every other dealers row, e.g. 'Bruce Quillen', 'Mike
--     Durham' - satisfies the roster's salesperson-OR-territory gate)
--   - rep_id       -> the existing canonical House sales_reps record
--     (5ced43be-d9ea-43a3-aa4f-c9c923d42a4d, acctivate_id='House'),
--     matching the rep already attributed to Kloss's actual bookings
--     (rep_id/rep_name = 'House' on every one of the 82 lines)
-- territory is intentionally left NULL - not inventing one, per
-- instruction; salesperson alone satisfies the roster gate.
--
-- This updates public.dealers only (the roster/master-data table) - no
-- source sales data (portal_acctivate_orders, portal_acctivate_order_lines,
-- bookings/invoice views/formulas), Open SO, Live KPI calculation logic,
-- Labor Day Promo, or sync scripts are touched.
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE public.dealers
SET
  acctivate_id = 'Kloss Furniture',
  salesperson  = 'House',
  rep_id       = '5ced43be-d9ea-43a3-aa4f-c9c923d42a4d'
WHERE id = '5b34c38a-52a6-46b8-b398-691cc0b78e10'
  AND name = 'Kloss Furniture';

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- 1. Kloss now resolves as its own dealer row, matching the real total:
--    SELECT entity_key, entity_label, primary_amt
--    FROM get_sales_reporting_grouped_rows(p_group_by:='dealer', p_metric:='bookings',
--      p_from:='2026-08-01', p_to:='2026-09-11', p_customer_ids:=NULL,
--      p_brand_cats:=NULL, p_skus:=NULL, p_rep_ids:=NULL, p_manager_id:=NULL)
--    WHERE entity_key = 'Kloss Furniture';
--    -- expect primary_amt = 59726.00
--
-- 2. Unmatched / Unassigned Dealer drops by exactly $59,726.00.
--
-- 3. Dealer Reporting grand total (sum across all rows) is unchanged from
--    before this migration - Kloss's revenue was always counted, just
--    misattributed to the Unmatched bucket.
--
-- 4. Rep Reporting totals are unchanged - rep attribution for Kloss's
--    bookings already came from the transaction data itself (rep_id=
--    'House'), not from public.dealers.
-- ══════════════════════════════════════════════════════════════════════════════
