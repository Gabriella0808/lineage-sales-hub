-- ══════════════════════════════════════════════════════════════════════════════
-- Allow all managers to read all market appointments (not just their team's).
--
-- Previous: "Managers read team market appointments" restricted SELECT to
--   rep_id IN (SELECT current_manager_rep_ids())  — own team reps only.
--
-- New: any manager can read every appointment across all reps/teams.
--   INSERT / UPDATE / DELETE remain team-scoped (managers still write only
--   their own reps' appointments).
--   Admin policy ("Admins manage all market appointments") is unchanged.
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Managers read team market appointments" ON public.market_appointments;

CREATE POLICY "Managers read all market appointments"
  ON public.market_appointments FOR SELECT TO authenticated
  USING (public.current_manager_id() IS NOT NULL);
