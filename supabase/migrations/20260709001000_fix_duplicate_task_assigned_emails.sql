-- Remove duplicate task-assigned email trigger.
-- When a task is assigned, both manager_tasks.assigned_user_id and
-- manager_task_assignees get written together. Two DB triggers were firing
-- (one on each table) causing every recipient to receive 2 identical emails.
-- The manager_task_assignees trigger (trg_email_on_task_assignee_added) is
-- sufficient — it fires once per inserted assignee row and covers all
-- assignment flows (inline board picker, task dialog, TasksPage).

DROP TRIGGER IF EXISTS trg_email_on_task_assignment ON public.manager_tasks;
