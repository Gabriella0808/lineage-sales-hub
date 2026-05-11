
-- Tracking table: one row per (task, user) ever notified about assignment
CREATE TABLE IF NOT EXISTS public.task_assignment_notifications_sent (
  task_id uuid NOT NULL,
  user_id uuid NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

ALTER TABLE public.task_assignment_notifications_sent ENABLE ROW LEVEL SECURITY;

-- No client access needed; only SECURITY DEFINER triggers touch this table.
-- (No policies = no access for normal users, which is what we want.)

-- Backfill from existing notifications so we don't re-notify on next trigger fire
INSERT INTO public.task_assignment_notifications_sent (task_id, user_id, sent_at)
SELECT DISTINCT related_id, user_id, MIN(created_at)
FROM public.notifications
WHERE type = 'task_assigned' AND related_id IS NOT NULL
GROUP BY related_id, user_id
ON CONFLICT DO NOTHING;

-- Trigger fn: assigned via assigned_manager_id
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  assignee_user_id uuid;
  assigner_name text;
BEGIN
  IF NEW.assigned_manager_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.assigned_manager_id IS NOT DISTINCT FROM OLD.assigned_manager_id THEN
    RETURN NEW;
  END IF;

  assignee_user_id := public.user_id_for_manager(NEW.assigned_manager_id);
  IF assignee_user_id IS NULL OR assignee_user_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Skip if we've already notified this user about this task
  IF EXISTS (
    SELECT 1 FROM public.task_assignment_notifications_sent
    WHERE task_id = NEW.id AND user_id = assignee_user_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(p.full_name, ''), 'Someone')
  INTO assigner_name
  FROM public.profiles p WHERE p.user_id = NEW.user_id;

  INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
  VALUES (
    assignee_user_id,
    'task_assigned',
    COALESCE(assigner_name, 'Someone') || ' assigned a task to you',
    NEW.title,
    '/tasks',
    NEW.id
  );

  INSERT INTO public.task_assignment_notifications_sent (task_id, user_id)
  VALUES (NEW.id, assignee_user_id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Trigger fn: assigned via assigned_user_id
CREATE OR REPLACE FUNCTION public.notify_task_assigned_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  assigner_name text;
BEGIN
  IF NEW.assigned_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.assigned_user_id IS NOT DISTINCT FROM OLD.assigned_user_id THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_user_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.task_assignment_notifications_sent
    WHERE task_id = NEW.id AND user_id = NEW.assigned_user_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(p.full_name, ''), 'Someone')
  INTO assigner_name
  FROM public.profiles p WHERE p.user_id = NEW.user_id;

  INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
  VALUES (
    NEW.assigned_user_id,
    'task_assigned',
    COALESCE(assigner_name, 'Someone') || ' assigned a task to you',
    NEW.title,
    '/tasks',
    NEW.id
  );

  INSERT INTO public.task_assignment_notifications_sent (task_id, user_id)
  VALUES (NEW.id, NEW.assigned_user_id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Trigger fn: assignees table (multi-assignee)
CREATE OR REPLACE FUNCTION public.notify_task_assignee_added()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  task_row public.manager_tasks%ROWTYPE;
  assigner_name text;
BEGIN
  SELECT * INTO task_row FROM public.manager_tasks WHERE id = NEW.task_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.user_id = task_row.user_id THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM public.task_assignment_notifications_sent
    WHERE task_id = task_row.id AND user_id = NEW.user_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(p.full_name, ''), 'Someone')
    INTO assigner_name
  FROM public.profiles p WHERE p.user_id = task_row.user_id;

  INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
  VALUES (
    NEW.user_id,
    'task_assigned',
    COALESCE(assigner_name, 'Someone') || ' assigned a task to you',
    task_row.title,
    '/tasks',
    task_row.id
  );

  INSERT INTO public.task_assignment_notifications_sent (task_id, user_id)
  VALUES (task_row.id, NEW.user_id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;
