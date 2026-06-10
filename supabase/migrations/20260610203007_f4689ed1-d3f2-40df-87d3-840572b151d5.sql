
DROP POLICY IF EXISTS "Users insert own notifications" ON public.notifications;
CREATE POLICY "Staff insert notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (is_staff_user());
