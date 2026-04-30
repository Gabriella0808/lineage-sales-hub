CREATE OR REPLACE FUNCTION public.is_trade_show_task(_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.manager_tasks t
    WHERE t.id = _task_id
      AND (
        t.description ILIKE '%lead from%'
        OR t.description ILIKE '%trade show%'
        OR t.title ILIKE '%trade show%'
      )
  )
$$;

DROP POLICY IF EXISTS "Admins view trade show tasks" ON public.manager_tasks;
DROP POLICY IF EXISTS "Admins view trade show task assignees" ON public.manager_task_assignees;

CREATE POLICY "Admins view trade show tasks"
ON public.manager_tasks
FOR SELECT TO authenticated
USING (public.is_admin() AND public.is_trade_show_task(id));

CREATE POLICY "Admins view trade show task assignees"
ON public.manager_task_assignees
FOR SELECT TO authenticated
USING (public.is_admin() AND public.is_trade_show_task(task_id));