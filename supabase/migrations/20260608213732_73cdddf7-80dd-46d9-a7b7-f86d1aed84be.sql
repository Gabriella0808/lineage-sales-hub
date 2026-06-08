
-- Admin-only insert for product collections
DROP POLICY IF EXISTS "Staff insert collections" ON public.product_collections;
CREATE POLICY "Admins insert collections" ON public.product_collections
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

-- Scope task-attachments storage reads to users who can view the task
DROP POLICY IF EXISTS "task-attachments authenticated read" ON storage.objects;
CREATE POLICY "task-attachments scoped read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'task-attachments'
    AND EXISTS (
      SELECT 1 FROM public.manager_task_attachments a
      WHERE a.storage_path = storage.objects.name
        AND public.can_view_manager_task(a.task_id)
    )
  );
