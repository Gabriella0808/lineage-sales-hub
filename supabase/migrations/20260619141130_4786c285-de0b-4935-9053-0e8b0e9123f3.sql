CREATE OR REPLACE FUNCTION public.can_view_manager_task(_task_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.manager_tasks t
    WHERE t.id = _task_id
      AND (
        t.user_id = auth.uid()
        OR (t.assigned_user_id IS NOT NULL AND t.assigned_user_id = auth.uid())
        OR (t.assigned_manager_id IS NOT NULL AND public.is_assigned_manager(t.assigned_manager_id))
        OR EXISTS (
          SELECT 1 FROM public.manager_task_assignees a
          WHERE a.task_id = t.id AND a.user_id = auth.uid()
        )
        OR (t.board_id IS NOT NULL AND public.can_view_task_board(t.board_id))
      )
  )
$function$;