-- Allow admins and managers to insert trips into travel_log from the Sales Calendar
CREATE POLICY "Managers insert travel_log"
ON public.travel_log
FOR INSERT
TO authenticated
WITH CHECK (is_admin() OR current_manager_id() IS NOT NULL);