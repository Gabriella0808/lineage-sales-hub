-- Status enum
CREATE TYPE public.manager_task_status AS ENUM ('todo', 'in_progress', 'blocked', 'done');

-- Tasks table
CREATE TABLE public.manager_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status public.manager_task_status NOT NULL DEFAULT 'todo',
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_manager_tasks_user ON public.manager_tasks(user_id);
CREATE INDEX idx_manager_tasks_status ON public.manager_tasks(status);

ALTER TABLE public.manager_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own tasks"
  ON public.manager_tasks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own tasks"
  ON public.manager_tasks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own tasks"
  ON public.manager_tasks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own tasks"
  ON public.manager_tasks FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- updated_at trigger
CREATE TRIGGER update_manager_tasks_updated_at
  BEFORE UPDATE ON public.manager_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-set completed_at when status -> done
CREATE OR REPLACE FUNCTION public.set_manager_task_completed_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
    NEW.completed_at := now();
  ELSIF NEW.status <> 'done' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_manager_tasks_completed_at
  BEFORE INSERT OR UPDATE ON public.manager_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_manager_task_completed_at();