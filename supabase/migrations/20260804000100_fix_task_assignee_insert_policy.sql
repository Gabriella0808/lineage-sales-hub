-- Fix: manager_task_assignees INSERT policy was restricted to task creators only.
-- Anyone who can VIEW a task (board member, assigned user/manager, creator, admin)
-- should also be able to assign people to it.
-- Uses existing can_view_manager_task() which already covers all visibility cases
-- including board membership via can_view_task_board().
--
-- ── Manual apply (Supabase SQL Editor) ───────────────────────────────────────
--   Paste and run this file directly in the Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Creator can add assignees" ON public.manager_task_assignees;
DROP POLICY IF EXISTS "Creator or self can remove assignees" ON public.manager_task_assignees;
DROP POLICY IF EXISTS "Task editors can add assignees" ON public.manager_task_assignees;
DROP POLICY IF EXISTS "Task editors or self can remove assignees" ON public.manager_task_assignees;
DROP POLICY IF EXISTS "Task viewers can add assignees" ON public.manager_task_assignees;
DROP POLICY IF EXISTS "Task viewers or self can remove assignees" ON public.manager_task_assignees;

-- INSERT: any user who can view the task (board member, assignee, creator, admin)
CREATE POLICY "Task viewers can add assignees"
ON public.manager_task_assignees
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_view_manager_task(task_id)
  OR public.is_admin()
);

-- DELETE: same users can remove assignees; assignees can always remove themselves
CREATE POLICY "Task viewers or self can remove assignees"
ON public.manager_task_assignees
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR public.can_view_manager_task(task_id)
  OR public.is_admin()
);
