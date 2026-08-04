-- Fix: manager_task_assignees INSERT policy was restricted to task creators only,
-- blocking admins and other task editors from assigning responsible users.
--
-- New rule: anyone who can UPDATE the parent task can also manage its assignees.
-- This mirrors the "Update own or assigned tasks" policy on manager_tasks:
--   creator | admin | assigned_user | assigned_manager | existing assignee
--
-- ── Manual apply (Supabase SQL Editor) ───────────────────────────────────────
--   Paste and run this file directly in the Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Creator can add assignees" ON public.manager_task_assignees;
DROP POLICY IF EXISTS "Creator or self can remove assignees" ON public.manager_task_assignees;

-- INSERT: any user who can edit the parent task may add assignees
CREATE POLICY "Task editors can add assignees"
ON public.manager_task_assignees
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.manager_tasks t
    WHERE t.id = task_id
      AND (
        t.user_id = auth.uid()
        OR public.is_admin()
        OR (t.assigned_user_id    IS NOT NULL AND t.assigned_user_id    = auth.uid())
        OR (t.assigned_manager_id IS NOT NULL AND public.is_assigned_manager(t.assigned_manager_id))
        OR EXISTS (
          SELECT 1 FROM public.manager_task_assignees a2
          WHERE a2.task_id = t.id AND a2.user_id = auth.uid()
        )
      )
  )
);

-- DELETE: same editors can remove assignees (self-removal always allowed)
CREATE POLICY "Task editors or self can remove assignees"
ON public.manager_task_assignees
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.manager_tasks t
    WHERE t.id = task_id
      AND (
        t.user_id = auth.uid()
        OR public.is_admin()
        OR (t.assigned_user_id    IS NOT NULL AND t.assigned_user_id    = auth.uid())
        OR (t.assigned_manager_id IS NOT NULL AND public.is_assigned_manager(t.assigned_manager_id))
      )
  )
);
