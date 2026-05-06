CREATE POLICY "Members can add subscribers"
ON public.task_board_members
FOR INSERT
TO authenticated
WITH CHECK (
  added_by = auth.uid()
  AND (
    public.can_view_task_board(board_id)
  )
);