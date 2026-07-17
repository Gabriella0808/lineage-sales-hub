-- Reschedule clearance weekly report to 7 pm ET (23:00 UTC) every Friday.
-- Replaces the 5 pm ET schedule set in 20260717000100.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-weekly-clearance-friday-5pm-et') THEN
    PERFORM cron.unschedule('notify-weekly-clearance-friday-5pm-et');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-weekly-clearance-friday-7pm-et') THEN
    PERFORM cron.unschedule('notify-weekly-clearance-friday-7pm-et');
  END IF;
END $$;

-- Ensure the helper function exists (idempotent with the previous migration).
CREATE OR REPLACE FUNCTION public.trigger_clearance_weekly_report()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_key text;
  supabase_url text := 'https://tcqpseblcwqjopbocfmr.supabase.co';
BEGIN
  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'email_queue_service_role_key'
  LIMIT 1;

  IF service_key IS NULL THEN
    RAISE WARNING 'trigger_clearance_weekly_report: email_queue_service_role_key not found in vault';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := supabase_url || '/functions/v1/notify-weekly-clearance',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- 7 pm EDT = 23:00 UTC (EDT is UTC-4, in effect during summer Fridays).
SELECT cron.schedule(
  'notify-weekly-clearance-friday-7pm-et',
  '0 23 * * 5',
  $$ SELECT public.trigger_clearance_weekly_report(); $$
);
