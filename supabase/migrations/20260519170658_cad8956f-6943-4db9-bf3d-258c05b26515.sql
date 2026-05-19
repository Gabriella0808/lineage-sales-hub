CREATE POLICY "Board members update board tasks"
ON public.manager_tasks
FOR UPDATE
TO authenticated
USING (board_id IS NOT NULL AND public.can_view_task_board(board_id))
WITH CHECK (board_id IS NOT NULL AND public.can_view_task_board(board_id));