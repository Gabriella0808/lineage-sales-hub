-- Re-schedule the clearance weekly report to fire every Friday at 5 pm ET (21:00 UTC).
-- The edge function now reads from v_portal_clearance_sales_analytics instead of
-- the legacy clearance_weekly_sales CSV-import table.

-- Remove any previous schedule (idempotent).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-weekly-clearance-friday-5pm-et') THEN
    PERFORM cron.unschedule('notify-weekly-clearance-friday-5pm-et');
  END IF;
END $$;

-- Helper function: calls the edge function via pg_net.
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

-- Schedule: every Friday at 21:00 UTC (5 pm EDT / 4 pm EST).
SELECT cron.schedule(
  'notify-weekly-clearance-friday-5pm-et',
  '0 21 * * 5',
  $$ SELECT public.trigger_clearance_weekly_report(); $$
);
