DROP POLICY IF EXISTS "Manage groups on own boards" ON public.task_board_groups;
CREATE POLICY "Manage groups on viewable boards" ON public.task_board_groups
  FOR ALL TO authenticated
  USING (public.can_view_task_board(board_id))
  WITH CHECK (public.can_view_task_board(board_id));