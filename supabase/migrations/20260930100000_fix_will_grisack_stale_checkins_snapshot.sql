-- The weekly review digest reads the saved responses JSON snapshot, not a
-- live recalculation - so moving the Sep 28 row onto Will's real manager
-- record (20260930090000) correctly fixed which manager owns it, but the
-- daily_checkins_actual value inside it was already frozen at "0" from
-- when Justin saved it under the wrong record, before the check-ins
-- attribution fix too. Corrects that one stored value to the real number
-- (8, verified against dealer_check_ins directly - placements_actual was
-- already correctly 0, left alone). Going forward, a fresh save each
-- Friday computes this live, so this is a one-time backfill, not a
-- recurring need.

UPDATE public.manager_weekly_reviews
SET responses = jsonb_set(responses, '{daily_checkins_actual}', '"8"')
WHERE manager_id = 'fc3184b3-848c-4921-8770-46127a2821bf'
  AND week_start = '2026-09-28';
