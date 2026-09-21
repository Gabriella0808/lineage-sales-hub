-- Keep the Prepaid Inventory figure (QuickBooks "Vendor Prepayments" account)
-- fresh: run the sync-qbo-vendor-prepayments edge function at 5 am and 5 pm
-- Eastern time, all year.
--
-- pg_cron runs in UTC and Eastern time shifts with daylight saving, so the job
-- wakes at every UTC hour that could be 5 am or 5 pm Eastern (9, 10, 21, 22)
-- and the helper only fires when the Eastern clock actually reads 5.
--
-- The call is authenticated with a shared secret sent in the x-cron-secret
-- header. The same value must exist as the edge function secret
-- QBO_SYNC_CRON_SECRET and as the vault secret qbo_sync_cron_secret (both set
-- outside this file so the value is never committed).

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job
  WHERE jobname IN ('sync-qbo-vendor-prepayments-hourly', 'sync-qbo-vendor-prepayments-5am-5pm-et');
END $$;

CREATE OR REPLACE FUNCTION public.trigger_qbo_vendor_prepayments_sync_5am_5pm_et()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_key text;
  et_hour int := extract(hour FROM (now() AT TIME ZONE 'America/New_York'));
BEGIN
  IF et_hour NOT IN (5, 17) THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'qbo_sync_cron_secret'
  LIMIT 1;

  IF service_key IS NULL THEN
    RAISE WARNING 'trigger_qbo_vendor_prepayments_sync: qbo_sync_cron_secret not found in vault';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := 'https://tcqpseblcwqjopbocfmr.supabase.co/functions/v1/sync-qbo-vendor-prepayments',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', service_key),
    body    := '{}'::jsonb
  );
END;
$$;

SELECT cron.schedule(
  'sync-qbo-vendor-prepayments-5am-5pm-et',
  '0 9,10,21,22 * * *',
  $$ SELECT public.trigger_qbo_vendor_prepayments_sync_5am_5pm_et(); $$
);
