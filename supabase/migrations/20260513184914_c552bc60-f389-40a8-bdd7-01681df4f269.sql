
CREATE OR REPLACE FUNCTION public.notify_task_due_today_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_key text;
  supabase_url text := 'https://tsbrvpgzawbbmuloxlkz.supabase.co';
BEGIN
  IF NEW.due_date IS DISTINCT FROM CURRENT_DATE THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'done' THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'email_queue_service_role_key'
  LIMIT 1;

  IF service_key IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/notify-tasks-due-today',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object('taskId', NEW.id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_due_today_on_insert ON public.manager_tasks;
CREATE TRIGGER trg_notify_task_due_today_on_insert
AFTER INSERT ON public.manager_tasks
FOR EACH ROW
EXECUTE FUNCTION public.notify_task_due_today_on_insert();
