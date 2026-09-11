-- ══════════════════════════════════════════════════════════════════════════════
-- CORRECTION to 20260913002900: that migration derived territory for 21
-- dealers from public.rep_territories (their assigned rep's territory).
-- That is not an acceptable source per explicit instruction — territory
-- must come directly from Acctivate customer data linked to the dealer,
-- not inferred from the rep.
--
-- INVESTIGATION: the genuine Acctivate source is dbo.tbCustomer._Territory
-- - already wired into scripts/acctivate-sync/Sync-Acctivate.ps1's
-- `dealers` sync query (line ~404: `tc._Territory AS territory`, joined
-- via `dbo.Customer cv LEFT JOIN dbo.tbCustomer tc ON tc.CustID = cv.CustID`).
-- That script is almost certainly how the existing 628 dealers with a
-- populated dealers.territory value got it - legitimate, untouched by
-- this migration. Checked every other synced table for a customer-level
-- territory field: portal_acctivate_invoices.territory and
-- stg_acctivate_invoice_headers_sync.territory both exist but are 100%
-- NULL (0 of 37,531 rows); acctivate_territories (a rep/manager-territory
-- table, not customer-level) is empty; the raw dbo_Invoice/dbo_OrderDetail/
-- dbo_tbOrder(s) mirror tables have no territory-like column at all.
-- dbo.tbCustomer._Territory is the only real source that exists anywhere.
--
-- This environment has no live connection to Acctivate's SQL Server -
-- only to the already-synced Supabase tables - so the real tc._Territory
-- value for these 25 dealers cannot be looked up from here. Only a run
-- of the existing dealers sync (or a scoped query) against the live
-- Acctivate database can populate it correctly. Reverting to NULL/
-- Unassigned is the only honest option right now, not a guess.
--
-- Reverts exactly the 21 rows 20260913002900 touched (Kloss + 20 of the
-- 24-dealer reconciliation batch; 4 of the 24 were already left
-- Unassigned and are untouched here, matching before). No other
-- dealers.territory/territory_id values are touched - the pre-existing
-- 628 legitimately-Acctivate-sourced dealers are left exactly as they
-- were. acctivate_id/customer_id, salesperson, rep_id, manager_id (the
-- Kloss fix and the 24-dealer reconciliation) are NOT touched - this is
-- territory attribution only.
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE public.dealers
SET territory = NULL, territory_id = NULL
WHERE acctivate_id IN (
  'Kloss Furniture',
  'Suburban Furniture', 'Create More Space', 'Shoreside Furnishings', 'Ashleys on Main',
  'Deets Furniture Inc', 'Wilford and Lee Home Accents', 'Manifest Design Corp.',
  'Beach Cove Resort Inc', 'Set Up - Weinberger''s Furniture', 'Set Up - Rex & Rex',
  'Powell''s Furniture Inc', 'Peaches To Beaches', 'Set Up - The Special Touch',
  'Rustic Elegance', 'Endless Creations', 'Amish & Sofa City Outlet',
  'Murphy Bed Center of Daytona', 'Ocean Gardens and Gifts', 'The Source Furnishings',
  'Set Up - Magnolia Pine'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- All 21 back to Unassigned:
-- SELECT name, acctivate_id, territory, territory_id FROM dealers WHERE acctivate_id IN (
--   'Kloss Furniture','Suburban Furniture','Create More Space','Shoreside Furnishings',
--   'Ashleys on Main','Deets Furniture Inc','Wilford and Lee Home Accents',
--   'Manifest Design Corp.','Beach Cove Resort Inc','Set Up - Weinberger''s Furniture',
--   'Set Up - Rex & Rex','Powell''s Furniture Inc','Peaches To Beaches',
--   'Set Up - The Special Touch','Rustic Elegance','Endless Creations',
--   'Amish & Sofa City Outlet','Murphy Bed Center of Daytona','Ocean Gardens and Gifts',
--   'The Source Furnishings','Set Up - Magnolia Pine'
-- );
-- -- expect territory IS NULL and territory_id IS NULL for all 21
--
-- Kloss still its own dealer row with correct amount/rep (untouched by
-- this migration):
-- SELECT entity_key, primary_amt, rep_name FROM get_sales_reporting_grouped_rows(
--   p_group_by:='dealer', p_metric:='bookings', p_from:='2026-01-01', p_to:='2026-09-11',
--   p_customer_ids:=NULL, p_brand_cats:=NULL, p_skus:=NULL, p_rep_ids:=NULL, p_manager_id:=NULL)
-- WHERE entity_key = 'Kloss Furniture';
-- -- expect 59726.00, rep House
-- ══════════════════════════════════════════════════════════════════════════════
