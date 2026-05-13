DROP POLICY IF EXISTS "Managers read team rep_targets" ON public.rep_targets;
CREATE POLICY "Managers read all rep_targets" ON public.rep_targets
FOR SELECT TO authenticated
USING (current_manager_id() IS NOT NULL);