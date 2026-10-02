-- ManagersPage.tsx's manager-dropdown dedup picked whichever duplicate
-- record owns the most sales_reps as the "real" one - for Will that's
-- backwards: the bare "Will" record (no email) owns 9 reps, the real
-- "Will Grisack" record (has an email) owns only 3. So while the dropdown
-- correctly DISPLAYED "Will Grisack", it was actually operating on the bare
-- record's id underneath, and Justin's Sep 28 2026 weekly review save
-- landed on manager_id = bare "Will" instead of the real Will Grisack
-- record that his other 11 weeks of history live under - making it
-- invisible in the picker and making that week's Daily Check-Ins/
-- Placements compute against the wrong (much smaller) rep set.
--
-- This moves that one stray row onto the real record (confirmed no
-- existing Sep 28 row there to conflict with). The dropdown-logic fix
-- itself (preferring the record with an email, not the one with more
-- reps) is a separate frontend change in ManagersPage.tsx.

UPDATE public.manager_weekly_reviews
SET manager_id = 'fc3184b3-848c-4921-8770-46127a2821bf'
WHERE manager_id = 'dd821573-dce7-4a5c-938d-535927608680'
  AND week_start = '2026-09-28';
