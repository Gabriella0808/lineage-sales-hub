-- Fix duplicate task-assigned emails.
--
-- email_on_task_assignee_added() was calling _post_task_assigned_email()
-- unconditionally on every INSERT into manager_task_assignees. The UI's
-- delete-then-reinsert pattern (setTaskAssigneesInline / syncAssignees)
-- fires a new INSERT for each interaction cycle, producing 4+ identical
-- emails for a single assignment.
--
-- The in-app notification triggers already use task_assignment_notifications_sent
-- (PK: task_id, user_id) for exactly this purpose. We apply the same guard
-- here: INSERT with ON CONFLICT DO NOTHING, then only proceed if the row
-- was actually inserted (ROW_COUNT = 1).

CREATE OR REPLACE FUNCTION public.email_on_task_assignee_added()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  creator   uuid;
  rows_inserted int;
BEGIN
  SELECT user_id INTO creator
  FROM public.manager_tasks
  WHERE id = NEW.task_id;

  -- Skip self-assignment (creator assigning themselves)
  IF NEW.user_id = creator THEN
    RETURN NEW;
  END IF;

  -- Claim the send slot; if another invocation already claimed it, skip.
  INSERT INTO public.task_assignment_notifications_sent (task_id, user_id)
  VALUES (NEW.task_id, NEW.user_id)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS rows_inserted = ROW_COUNT;

  IF rows_inserted = 0 THEN
    RETURN NEW;
  END IF;

  PERFORM public._post_task_assigned_email(NEW.task_id, NEW.user_id, creator);
  RETURN NEW;
END;
$$;
