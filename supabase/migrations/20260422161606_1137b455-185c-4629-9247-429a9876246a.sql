
-- Add generic assignee column on manager_tasks
ALTER TABLE public.manager_tasks
ADD COLUMN IF NOT EXISTS assigned_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_manager_tasks_assigned_user
  ON public.manager_tasks (assigned_user_id);

-- Drop & recreate SELECT/UPDATE policies to include assigned_user_id
DROP POLICY IF EXISTS "View own or assigned tasks" ON public.manager_tasks;
DROP POLICY IF EXISTS "Update own or assigned tasks" ON public.manager_tasks;

CREATE POLICY "View own or assigned tasks"
ON public.manager_tasks
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR (assigned_user_id IS NOT NULL AND assigned_user_id = auth.uid())
  OR (assigned_manager_id IS NOT NULL AND public.is_assigned_manager(assigned_manager_id))
);

CREATE POLICY "Update own or assigned tasks"
ON public.manager_tasks
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR (assigned_user_id IS NOT NULL AND assigned_user_id = auth.uid())
  OR (assigned_manager_id IS NOT NULL AND public.is_assigned_manager(assigned_manager_id))
);

-- Trigger: notify the assigned_user_id directly when set/changed
CREATE OR REPLACE FUNCTION public.notify_task_assigned_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_assigned_user ON public.manager_tasks;
CREATE TRIGGER trg_notify_task_assigned_user
AFTER INSERT OR UPDATE OF assigned_user_id ON public.manager_tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_assigned_user();

-- Update status-changed notifier to also notify assigned_user_id
CREATE OR REPLACE FUNCTION public.notify_task_status_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  manager_assignee_user_id uuid;
  changer_id uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  changer_id := auth.uid();
  manager_assignee_user_id := CASE
    WHEN NEW.assigned_manager_id IS NOT NULL
      THEN public.user_id_for_manager(NEW.assigned_manager_id)
    ELSE NULL
  END;

  IF NEW.user_id IS NOT NULL AND NEW.user_id <> COALESCE(changer_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
    VALUES (NEW.user_id, 'task_status_changed',
            'Task status updated',
            NEW.title || ' → ' || NEW.status,
            '/tasks', NEW.id);
  END IF;

  IF manager_assignee_user_id IS NOT NULL
     AND manager_assignee_user_id <> NEW.user_id
     AND manager_assignee_user_id <> COALESCE(changer_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
    VALUES (manager_assignee_user_id, 'task_status_changed',
            'Task status updated',
            NEW.title || ' → ' || NEW.status,
            '/tasks', NEW.id);
  END IF;

  IF NEW.assigned_user_id IS NOT NULL
     AND NEW.assigned_user_id <> NEW.user_id
     AND NEW.assigned_user_id <> COALESCE(manager_assignee_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND NEW.assigned_user_id <> COALESCE(changer_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
    VALUES (NEW.assigned_user_id, 'task_status_changed',
            'Task status updated',
            NEW.title || ' → ' || NEW.status,
            '/tasks', NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- Function returning assignable users (admins, managers, reps) visible to authenticated users
CREATE OR REPLACE FUNCTION public.assignable_users()
RETURNS TABLE(user_id uuid, full_name text, email text, role text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Admins
  SELECT ur.user_id,
         COALESCE(NULLIF(p.full_name, ''), split_part(u.email, '@', 1)) AS full_name,
         u.email::text,
         'admin'::text AS role
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  LEFT JOIN public.profiles p ON p.user_id = ur.user_id
  WHERE ur.role = 'admin'

  UNION

  -- Managers (mapped via email)
  SELECT u.id AS user_id,
         COALESCE(NULLIF(p.full_name, ''), m.name) AS full_name,
         u.email::text,
         'manager'::text AS role
  FROM public.managers m
  JOIN auth.users u ON lower(u.email) = lower(m.email)
  LEFT JOIN public.profiles p ON p.user_id = u.id

  UNION

  -- Sales reps (mapped via user_reps)
  SELECT ur2.user_id,
         COALESCE(NULLIF(p.full_name, ''), sr.name) AS full_name,
         u.email::text,
         'rep'::text AS role
  FROM public.user_reps ur2
  JOIN public.sales_reps sr ON sr.id = ur2.rep_id
  JOIN auth.users u ON u.id = ur2.user_id
  LEFT JOIN public.profiles p ON p.user_id = ur2.user_id
  ;
$$;

GRANT EXECUTE ON FUNCTION public.assignable_users() TO authenticated;
