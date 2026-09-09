-- ══════════════════════════════════════════════════════════════════════════════
-- Same gap as 20260913000200, bookings side: Live KPI totals all booking
-- revenue unconditionally; Dealer Reporting is roster-driven and excludes
-- anyone not on the active-dealer roster. $367,249.39 across 19 customer_ids
-- was unmatched (all-time bookings).
--
-- 17 of those 19 are real, clean Acctivate customer IDs (Deets Furniture
-- Inc, Sprintz Furniture Showroom, Suburban Furniture, etc.) with clear rep
-- attribution — backfilled the same way as the invoiced fix: upsert into
-- public.dealers, only filling a currently-blank salesperson, never
-- overwriting or deleting anything.
--
-- 2 of the 19 are NOT backfilled here — their customer_id in the booking
-- data itself is corrupted, not just missing from the roster:
--   '65a5eb0f-b7d6-4382-b8bc-f74da26eabe3' (a UUID)   -> dealer_name "Kloss Furniture"
--   'ChIJq2TZQvA4tokRf6KSmJZjTeU'          (a Google Place ID) -> dealer_name "Belfort Furniture"
-- Creating a dealers row keyed to a UUID/Place-ID would just bake that
-- corruption into the roster permanently and show up as the literal
-- Customer ID in Dealer Reporting. This is a source-data problem in
-- whatever populated these two booking lines, not a roster gap — flagged
-- for separate review, not silently patched. Combined impact: $3,764.00
-- of the $367,249.39 gap stays open until the real Acctivate CustId for
-- these two is identified.
-- ══════════════════════════════════════════════════════════════════════════════

WITH unmatched AS (
  SELECT DISTINCT ON (upper(trim(a.customer_id::text)))
    a.customer_id,
    a.dealer_name,
    a.rep_name
  FROM public.v_portal_dealer_rep_reporting_lines a
  WHERE a.metric_type = 'bookings'
    AND NULLIF(TRIM(a.customer_id::text), '') IS NOT NULL
    AND a.customer_id NOT IN (
      '65a5eb0f-b7d6-4382-b8bc-f74da26eabe3',
      'ChIJq2TZQvA4tokRf6KSmJZjTeU'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.dealers d
      WHERE d.source <> 'field_only'
        AND (NULLIF(TRIM(d.salesperson), '') IS NOT NULL OR NULLIF(TRIM(d.territory), '') IS NOT NULL)
        AND lower(trim(d.acctivate_id)) = lower(trim(a.customer_id::text))
    )
  ORDER BY upper(trim(a.customer_id::text)), a.amount DESC NULLS LAST
)
INSERT INTO public.dealers (acctivate_id, name, salesperson, source)
SELECT
  u.customer_id,
  COALESCE(NULLIF(TRIM(u.dealer_name), ''), u.customer_id),
  NULLIF(TRIM(u.rep_name), ''),
  'acctivate'
FROM unmatched u
ON CONFLICT (acctivate_id) DO UPDATE SET
  salesperson = COALESCE(NULLIF(TRIM(dealers.salesperson), ''), EXCLUDED.salesperson),
  updated_at  = now()
WHERE NULLIF(TRIM(dealers.salesperson), '') IS NULL
  AND NULLIF(TRIM(dealers.territory), '') IS NULL;

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- 1. Remaining gap should now be exactly the 2 flagged corrupted IDs ($3,764.00):
--    SELECT round(sum(a.amount),2) AS remaining_unmatched
--    FROM public.v_portal_dealer_rep_reporting_lines a
--    WHERE a.metric_type = 'bookings'
--      AND NOT EXISTS (
--        SELECT 1 FROM public.dealers d
--        WHERE d.source <> 'field_only'
--          AND (NULLIF(TRIM(d.salesperson), '') IS NOT NULL OR NULLIF(TRIM(d.territory), '') IS NOT NULL)
--          AND lower(trim(d.acctivate_id)) = lower(trim(a.customer_id::text))
--      );
--
-- 2. Dealer Reporting bookings total (should be $367,249.39 - $3,764.00 =
--    $363,485.39 closer to the unscoped $5,152,517.83 total than before):
--    SELECT round(sum(primary_amt),2) FROM public.get_sales_reporting_grouped_rows(
--      'bookings','dealer','2020-01-01','2030-12-31',NULL,NULL,NULL,NULL,NULL,NULL,NULL
--    );
-- ══════════════════════════════════════════════════════════════════════════════
