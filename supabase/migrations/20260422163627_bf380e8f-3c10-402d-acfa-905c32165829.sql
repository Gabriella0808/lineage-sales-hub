
-- Allow any logged-in manager to read all dealers (temporary, for Check-Ins map)
CREATE POLICY "Managers read all dealers (temp)"
ON public.dealers
FOR SELECT
TO authenticated
USING (current_manager_id() IS NOT NULL);

-- Allow managers to update lat/lng on any dealer (so geocoding cache works)
DROP POLICY IF EXISTS "Managers update team dealers" ON public.dealers;
CREATE POLICY "Managers update any dealer (temp)"
ON public.dealers
FOR UPDATE
TO authenticated
USING (current_manager_id() IS NOT NULL)
WITH CHECK (current_manager_id() IS NOT NULL);
