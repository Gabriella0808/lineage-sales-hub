-- Allow admins and managers to delete dealers
CREATE POLICY "Admins delete dealers"
ON public.dealers
FOR DELETE
TO authenticated
USING (is_admin());

CREATE POLICY "Managers delete dealers (temp)"
ON public.dealers
FOR DELETE
TO authenticated
USING (current_manager_id() IS NOT NULL);