CREATE POLICY "Managers delete own travel_log"
ON public.travel_log
FOR DELETE
TO authenticated
USING (manager_id = current_manager_id());

CREATE POLICY "Admins delete any travel_log"
ON public.travel_log
FOR DELETE
TO authenticated
USING (is_admin());