-- Add UPDATE policies for travel_log.
-- Previously only SELECT/INSERT/DELETE were covered; the missing UPDATE policy
-- caused RLS to silently block all edits (including date changes).
CREATE POLICY "Managers update own travel_log"
ON public.travel_log
FOR UPDATE
TO authenticated
USING (manager_id = current_manager_id())
WITH CHECK (manager_id = current_manager_id());

CREATE POLICY "Admins update any travel_log"
ON public.travel_log
FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());
