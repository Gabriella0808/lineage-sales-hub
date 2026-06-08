
CREATE TABLE public.manager_task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.manager_tasks(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  content_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mta_task ON public.manager_task_attachments(task_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manager_task_attachments TO authenticated;
GRANT ALL ON public.manager_task_attachments TO service_role;

ALTER TABLE public.manager_task_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View attachments if can view task"
ON public.manager_task_attachments FOR SELECT TO authenticated
USING (public.can_view_manager_task(task_id));

CREATE POLICY "Insert attachments if can view task"
ON public.manager_task_attachments FOR INSERT TO authenticated
WITH CHECK (uploaded_by = auth.uid() AND public.can_view_manager_task(task_id));

CREATE POLICY "Delete own attachments or task creator"
ON public.manager_task_attachments FOR DELETE TO authenticated
USING (uploaded_by = auth.uid() OR public.is_manager_task_creator(task_id));

-- Storage policies: task-attachments bucket
CREATE POLICY "task-attachments authenticated read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'task-attachments');

CREATE POLICY "task-attachments authenticated insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'task-attachments' AND owner = auth.uid());

CREATE POLICY "task-attachments owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'task-attachments' AND owner = auth.uid());
