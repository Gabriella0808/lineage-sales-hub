-- ══════════════════════════════════════════════════════════════════════════════
-- Revert 20260913000300 (bookings dealer roster backfill) — the pre-backfill
-- bookings total was confirmed correct; the backfill should not have been
-- applied to bookings.
--
-- Deletes exactly the 17 dealers rows that migration inserted. Confirmed via
-- created_at/updated_at (both = 2026-09-09 15:06:45.821921+00 on all 17,
-- i.e. the moment that migration ran) that every one of them was a fresh
-- INSERT, not an update to a pre-existing row — so a full DELETE is the
-- exact, precise inverse of that migration, not a partial/approximate
-- rollback. Does not touch the 33 dealers backfilled for invoiced
-- (20260913000200) — that fix was not asked to be reverted.
-- ══════════════════════════════════════════════════════════════════════════════

DELETE FROM public.dealers
WHERE acctivate_id IN (
  'Ashleys on Main',
  'Deets Furniture Inc',
  'Endless Creations',
  'Rustic Elegance',
  'Set Up - Christmas Tree Hill, Inc',
  'Set Up - Magnolia Pine',
  'Set Up - Manifest Design Corp.',
  'Set Up - Marketplace on Elm',
  'Set Up - Ocean Gardens and Gifts',
  'Set Up - Rex & Rex',
  'Set Up - Setting The Space',
  'Set Up - The Special Touch',
  'Set Up - Weinberger''s Furniture',
  'Shoreside Furnishings',
  'Sprintz Furniture Showroom',
  'Suburban Furniture',
  'Wilford and Lee Home Accents'
)
AND created_at = '2026-09-09 15:06:45.821921+00'
AND updated_at = '2026-09-09 15:06:45.821921+00';

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- 1. Roster should be back to 661 (678 - 17):
--    SELECT count(*) FROM public.dealers
--    WHERE source <> 'field_only'
--      AND (NULLIF(TRIM(salesperson),'') IS NOT NULL OR NULLIF(TRIM(territory),'') IS NOT NULL);
--
-- 2. Dealer Reporting bookings total should be back to $4,785,268.44:
--    SELECT round(sum(primary_amt),2) FROM public.get_sales_reporting_grouped_rows(
--      'bookings','dealer','2020-01-01','2030-12-31',NULL,NULL,NULL,NULL,NULL,NULL,NULL
--    );
--
-- 3. Invoiced backfill (20260913000200) untouched — still 661... wait, that
--    migration alone brought the roster to 661; after this revert it drops
--    those 17 bookings-only additions back out. Confirm invoiced total is
--    still exactly correct:
--    SELECT round(sum(primary_amt),2) FROM public.get_sales_reporting_grouped_rows(
--      'invoiced','dealer','2026-01-01','2026-12-31',NULL,NULL,NULL,NULL,NULL,NULL,NULL
--    );
--    -- should still be $2,334,884.69
-- ══════════════════════════════════════════════════════════════════════════════
