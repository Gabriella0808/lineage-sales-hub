DROP POLICY IF EXISTS "View boards (creator/admin/assigned)" ON public.task_boards;

CREATE POLICY "View boards (creator/admin/assigned)"
ON public.task_boards
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR public.can_view_task_board(id)
);