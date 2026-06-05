
-- Restrict compare_periods_notes to staff users
DROP POLICY IF EXISTS "Authenticated delete compare_periods_notes" ON public.compare_periods_notes;
DROP POLICY IF EXISTS "Authenticated insert compare_periods_notes" ON public.compare_periods_notes;
DROP POLICY IF EXISTS "Authenticated read compare_periods_notes" ON public.compare_periods_notes;
DROP POLICY IF EXISTS "Authenticated update compare_periods_notes" ON public.compare_periods_notes;

CREATE POLICY "Staff read compare_periods_notes" ON public.compare_periods_notes
  FOR SELECT TO authenticated USING (public.is_staff_user());
CREATE POLICY "Staff insert compare_periods_notes" ON public.compare_periods_notes
  FOR INSERT TO authenticated WITH CHECK (public.is_staff_user());
CREATE POLICY "Staff update compare_periods_notes" ON public.compare_periods_notes
  FOR UPDATE TO authenticated USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());
CREATE POLICY "Staff delete compare_periods_notes" ON public.compare_periods_notes
  FOR DELETE TO authenticated USING (public.is_staff_user());

-- Restrict "public" manager_tasks visibility to staff users
DROP POLICY IF EXISTS "Anyone can view public tasks" ON public.manager_tasks;
CREATE POLICY "Staff view public tasks" ON public.manager_tasks
  FOR SELECT TO authenticated
  USING (visibility = 'public' AND public.is_staff_user());

-- Restrict Realtime channel subscriptions to staff users
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can subscribe to realtime" ON realtime.messages;
CREATE POLICY "Staff can subscribe to realtime" ON realtime.messages
  FOR SELECT TO authenticated
  USING (public.is_staff_user());
