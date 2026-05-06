CREATE OR REPLACE FUNCTION public.is_task_board_creator(_board_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.task_boards b WHERE b.id = _board_id AND b.created_by = auth.uid());
$$;

DROP POLICY IF EXISTS "Board creator manages members" ON public.task_board_members;
CREATE POLICY "Board creator manages members"
ON public.task_board_members
FOR ALL
TO authenticated
USING (public.is_task_board_creator(board_id))
WITH CHECK (public.is_task_board_creator(board_id));

DROP POLICY IF EXISTS "Members can add subscribers" ON public.task_board_members;
CREATE POLICY "Members can add subscribers"
ON public.task_board_members
FOR INSERT
TO authenticated
WITH CHECK (added_by = auth.uid() AND public.can_view_task_board(board_id));

-- Also rewrite task_boards SELECT to use the helper to avoid touching task_board_members recursively at planning time
DROP POLICY IF EXISTS "View boards (creator or subscribed)" ON public.task_boards;
CREATE POLICY "View boards (creator or subscribed)"
ON public.task_boards
FOR SELECT
TO authenticated
USING (public.can_view_task_board(id));