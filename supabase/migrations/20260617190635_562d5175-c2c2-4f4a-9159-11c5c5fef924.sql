
CREATE TABLE public.manager_task_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.manager_tasks(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  mentions uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mtu_task ON public.manager_task_updates(task_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manager_task_updates TO authenticated;
GRANT ALL ON public.manager_task_updates TO service_role;
ALTER TABLE public.manager_task_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View updates if can view task" ON public.manager_task_updates
  FOR SELECT TO authenticated USING (public.can_view_manager_task(task_id));
CREATE POLICY "Insert updates if can view task" ON public.manager_task_updates
  FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid() AND public.can_view_manager_task(task_id));
CREATE POLICY "Update own updates" ON public.manager_task_updates
  FOR UPDATE TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY "Delete own updates or task creator" ON public.manager_task_updates
  FOR DELETE TO authenticated USING (author_id = auth.uid() OR public.is_manager_task_creator(task_id));

CREATE TRIGGER trg_mtu_updated_at BEFORE UPDATE ON public.manager_task_updates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
