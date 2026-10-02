-- Same stale-snapshot issue as Will's (20260930100000): Mateo also has a
-- bare duplicate manager record ("Mateo" alongside "Mateo De Lisa"), so his
-- most recent save (before the check-ins attribution fix) only counted his
-- real record's reps, missing the bare duplicate's. Stored value was 5;
-- live, correctly-attributed count is 10 (verified directly against
-- dealer_check_ins). placements_actual was already correctly 0.
--
-- Checked every other manager this digest covers (Kate) against a live
-- recalculation too - she has no duplicate record, and her stored value
-- already matched exactly (15 vs 15), so no backfill needed for her.

UPDATE public.manager_weekly_reviews
SET responses = jsonb_set(responses, '{daily_checkins_actual}', '"10"')
WHERE manager_id = 'b291385c-e5db-470c-93d3-9e034361b3d4'
  AND week_start = '2026-09-28';
