-- ══════════════════════════════════════════════════════════════════════════════
-- Allow all reps to read all market appointments (not just their own).
-- All users now have full read access, matching admin visibility.
-- Write access (INSERT / UPDATE / DELETE) for reps remains scoped to their
-- own appointments only.
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Reps read own market appointments" ON public.market_appointments;

CREATE POLICY "Reps read all market appointments"
  ON public.market_appointments FOR SELECT TO authenticated
  USING (public.current_rep_id() IS NOT NULL);
