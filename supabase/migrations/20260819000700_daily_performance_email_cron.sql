-- Daily Performance Email — pg_cron schedule
--
-- Sends a daily invoices + bookings summary to all admins and managers at
-- 6:15 PM Eastern Time (22:15 UTC during EDT / summer).
--
-- The 5 PM ET Acctivate VM sync runs before this, so data is current.
-- In winter (EST = UTC-5) the cron fires at 5:15 PM ET — still fine.
--
-- ── Manual trigger (run in SQL editor to send immediately) ────────────────────
--   SELECT public.trigger_send_daily_performance_email();
--
-- ── Dry run (returns data + recipients without sending) ───────────────────────
--   Call the edge function with body: { "dryRun": true }
--   e.g. via Supabase Dashboard → Edge Functions → send-daily-performance-email → Invoke
--
-- ── Validation: confirm numbers match the portal Daily Performance cards ───────
--
--   1. Today's reporting date in Eastern Time:
--      SELECT (NOW() AT TIME ZONE 'America/New_York')::date AS today_et;
--
--   2. Daily Invoices total (must match portal Daily Invoices card):
--      SELECT ROUND(SUM(amount)) AS daily_invoiced
--      FROM public.v_companywide_reporting_actuals
--      WHERE metric_type = 'invoiced'
--        AND transaction_date = (NOW() AT TIME ZONE 'America/New_York')::date;
--
--   3. Daily Bookings total (must match portal Daily Bookings card):
--      SELECT ROUND(SUM(amount)) AS daily_bookings
--      FROM public.v_companywide_reporting_actuals
--      WHERE metric_type = 'bookings'
--        AND transaction_date = (NOW() AT TIME ZONE 'America/New_York')::date;
--
--   4. Collection breakdown (matches email body):
--      SELECT
--        metric_type,
--        brand_category,
--        ROUND(SUM(amount)) AS total
--      FROM public.v_companywide_reporting_actuals
--      WHERE transaction_date = (NOW() AT TIME ZONE 'America/New_York')::date
--      GROUP BY metric_type, brand_category
--      ORDER BY metric_type, total DESC;
--
--   5. Recipient list (admins + managers who will receive the email):
--      SELECT u.email, ur.role
--      FROM auth.users u
--      JOIN public.user_roles ur ON ur.user_id = u.id
--      WHERE ur.role IN ('admin', 'manager')
--        AND u.email IS NOT NULL
--        AND u.email <> ''
--      ORDER BY ur.role, u.email;
--
--   6. Check cron job status:
--      SELECT jobname, schedule, active
--      FROM cron.job
--      WHERE jobname = 'send-daily-performance-email';
--
--   7. Recent cron run history:
--      SELECT j.jobname, r.status, r.start_time, r.return_message
--      FROM cron.job_run_details r
--      JOIN cron.job j ON j.jobid = r.jobid
--      WHERE j.jobname = 'send-daily-performance-email'
--      ORDER BY r.start_time DESC
--      LIMIT 10;
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Trigger function ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trigger_send_daily_performance_email()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_key  text;
  supabase_url text := 'https://tcqpseblcwqjopbocfmr.supabase.co';
BEGIN
  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'email_queue_service_role_key'
  LIMIT 1;

  -- send-daily-performance-email has verify_jwt=false, so the anon key is sufficient.
  IF service_key IS NULL THEN
    service_key := 'sb_publishable_CE2Pld7FgCecomxJRTRUOw_aI2z9Bko';
  END IF;

  PERFORM net.http_post(
    url     := supabase_url || '/functions/v1/send-daily-performance-email',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- ── Schedule: 22:15 UTC = 6:15 PM EDT (UTC-4) every day ──────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-daily-performance-email') THEN
    PERFORM cron.unschedule('send-daily-performance-email');
  END IF;
END $$;

SELECT cron.schedule(
  'send-daily-performance-email',
  '15 22 * * *',
  $$ SELECT public.trigger_send_daily_performance_email(); $$
);
