CREATE POLICY "Managers read all dealer_sales" ON public.dealer_sales
FOR SELECT TO authenticated
USING (current_manager_id() IS NOT NULL);