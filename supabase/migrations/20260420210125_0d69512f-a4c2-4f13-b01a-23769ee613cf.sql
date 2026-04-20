
-- 1. Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  related_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON public.notifications (user_id, read_at, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Service role / triggers can insert; allow inserts via SECURITY DEFINER trigger functions only
-- We do NOT add an INSERT policy for normal users.

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- 2. Helper: resolve auth.users.id from a manager_id (by email)
CREATE OR REPLACE FUNCTION public.user_id_for_manager(_manager_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM public.managers m
  JOIN auth.users u ON lower(u.email) = lower(m.email)
  WHERE m.id = _manager_id
  LIMIT 1
$$;

-- 3. Trigger: notify assignee when a task is created with assignment, or when assignment changes
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_task_assigned
AFTER INSERT OR UPDATE OF assigned_manager_id ON public.manager_tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_assigned();

-- 4. Trigger: notify creator + assignee when task status changes
CREATE OR REPLACE FUNCTION public.notify_task_status_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assignee_user_id uuid;
  changer_id uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  changer_id := auth.uid();
  assignee_user_id := CASE
    WHEN NEW.assigned_manager_id IS NOT NULL
      THEN public.user_id_for_manager(NEW.assigned_manager_id)
    ELSE NULL
  END;

  -- notify creator if they didn't make the change
  IF NEW.user_id IS NOT NULL AND NEW.user_id <> COALESCE(changer_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
    VALUES (NEW.user_id, 'task_status_changed',
            'Task status updated',
            NEW.title || ' → ' || NEW.status,
            '/tasks', NEW.id);
  END IF;

  -- notify assignee if different from creator and from changer
  IF assignee_user_id IS NOT NULL
     AND assignee_user_id <> NEW.user_id
     AND assignee_user_id <> COALESCE(changer_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
    VALUES (assignee_user_id, 'task_status_changed',
            'Task status updated',
            NEW.title || ' → ' || NEW.status,
            '/tasks', NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_task_status_changed
AFTER UPDATE OF status ON public.manager_tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_status_changed();

-- 5. Trigger: notify all signed-up users when a new dealer is created
CREATE OR REPLACE FUNCTION public.notify_new_dealer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
  SELECT p.user_id, 'new_dealer', 'New dealer added', NEW.name, '/dealers', NEW.id
  FROM public.profiles p;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_dealer
AFTER INSERT ON public.dealers
FOR EACH ROW EXECUTE FUNCTION public.notify_new_dealer();

-- 6. Trigger: notify all signed-up users when a new sales rep is created
CREATE OR REPLACE FUNCTION public.notify_new_rep()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
  SELECT p.user_id, 'new_rep', 'New sales rep added', NEW.name, '/reps', NEW.id
  FROM public.profiles p;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_rep
AFTER INSERT ON public.sales_reps
FOR EACH ROW EXECUTE FUNCTION public.notify_new_rep();

-- 7. Monday boards table (so we can fire a trigger on insert)
CREATE TABLE IF NOT EXISTS public.monday_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monday_board_id text NOT NULL UNIQUE,
  name text NOT NULL,
  workspace_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.monday_boards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read monday_boards"
  ON public.monday_boards FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.notify_new_monday_board()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, link, related_id)
  SELECT p.user_id, 'new_monday_board', 'New Monday board added', NEW.name, '/monday-boards', NEW.id
  FROM public.profiles p;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_monday_board
AFTER INSERT ON public.monday_boards
FOR EACH ROW EXECUTE FUNCTION public.notify_new_monday_board();
