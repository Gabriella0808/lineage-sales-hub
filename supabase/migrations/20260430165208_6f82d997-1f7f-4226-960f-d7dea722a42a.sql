
CREATE POLICY "Admins view all tasks" ON public.manager_tasks
  FOR SELECT TO authenticated USING (is_admin());

CREATE POLICY "Admins update all tasks" ON public.manager_tasks
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Admins delete all tasks" ON public.manager_tasks
  FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "Admins view all task assignees" ON public.manager_task_assignees
  FOR SELECT TO authenticated USING (is_admin());

CREATE POLICY "Admins manage task assignees" ON public.manager_task_assignees
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
