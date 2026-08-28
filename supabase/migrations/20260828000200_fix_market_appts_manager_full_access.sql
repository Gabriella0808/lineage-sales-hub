-- ══════════════════════════════════════════════════════════════════════════════
-- Give managers full access (read + write) on ALL market appointments,
-- matching admin capability for this section.
--
-- Previous: INSERT / UPDATE / DELETE were scoped to the manager's own team reps.
-- New: any manager can insert, update, or delete any appointment.
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Managers insert market appointments" ON public.market_appointments;
DROP POLICY IF EXISTS "Managers update market appointments" ON public.market_appointments;
DROP POLICY IF EXISTS "Managers delete market appointments" ON public.market_appointments;

CREATE POLICY "Managers insert market appointments"
  ON public.market_appointments FOR INSERT TO authenticated
  WITH CHECK (public.current_manager_id() IS NOT NULL);

CREATE POLICY "Managers update market appointments"
  ON public.market_appointments FOR UPDATE TO authenticated
  USING    (public.current_manager_id() IS NOT NULL)
  WITH CHECK (public.current_manager_id() IS NOT NULL);

CREATE POLICY "Managers delete market appointments"
  ON public.market_appointments FOR DELETE TO authenticated
  USING (public.current_manager_id() IS NOT NULL);
