CREATE OR REPLACE FUNCTION public.notify_task_mention_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  service_key text;
  supabase_url text := 'https://tsbrvpgzawbbmuloxlkz.supabase.co';
BEGIN
  IF NEW.mentions IS NULL OR array_length(NEW.mentions, 1) IS NULL THEN
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
    url := supabase_url || '/functions/v1/notify-task-mention',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object('updateId', NEW.id)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_task_mention_on_insert ON public.manager_task_updates;
CREATE TRIGGER trg_notify_task_mention_on_insert
AFTER INSERT ON public.manager_task_updates
FOR EACH ROW
EXECUTE FUNCTION public.notify_task_mention_on_insert();