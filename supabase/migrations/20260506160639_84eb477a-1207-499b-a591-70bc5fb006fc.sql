
CREATE TABLE public.task_board_members (
  board_id uuid NOT NULL REFERENCES public.task_boards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  added_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, user_id)
);

ALTER TABLE public.task_board_members ENABLE ROW LEVEL SECURITY;

-- Board creator manages members
CREATE POLICY "Board creator manages members"
ON public.task_board_members
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.task_boards b WHERE b.id = task_board_members.board_id AND b.created_by = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.task_boards b WHERE b.id = task_board_members.board_id AND b.created_by = auth.uid()));

-- Members can see their own membership row
CREATE POLICY "Members read own membership"
ON public.task_board_members
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Update can_view_task_board to include members
CREATE OR REPLACE FUNCTION public.can_view_task_board(_board_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.task_boards b WHERE b.id = _board_id AND b.created_by = auth.uid())
    OR EXISTS (SELECT 1 FROM public.task_board_members m WHERE m.board_id = _board_id AND m.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.manager_tasks t
      WHERE t.board_id = _board_id
        AND (
          t.user_id = auth.uid()
          OR t.assigned_user_id = auth.uid()
          OR (t.assigned_manager_id IS NOT NULL AND public.is_assigned_manager(t.assigned_manager_id))
          OR EXISTS (SELECT 1 FROM public.manager_task_assignees a WHERE a.task_id = t.id AND a.user_id = auth.uid())
        )
    );
$function$;
