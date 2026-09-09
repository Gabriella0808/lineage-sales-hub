-- ══════════════════════════════════════════════════════════════════════════════
-- Actually schedule the Labor Day Promo (LD26) daily email cron job.
--
-- The trigger function and edge function (send-labor-day-promo-email,
-- deployed and ACTIVE) already existed from 20260911000200, but the
-- cron.schedule() call in that migration never actually took effect — SELECT
-- * FROM cron.job WHERE jobname = 'send-labor-day-promo-email' returns zero
-- rows, and there is no run history. The job was never live.
--
-- This migration:
--   1. Moves the cutoff from 2026-09-15 to 2026-09-14 (inclusive) — last
--      valid send date is now September 14, per this request.
--   2. Moves the send time from 6:15 PM to 6:00 PM Eastern (22:00 UTC —
--      September is EDT, UTC-4; matches the existing
--      notify-weekly-clearance-friday-6pm-et convention already in this
--      project for "6pm ET").
--   3. Actually calls cron.schedule() so the job goes live starting today
--      (2026-09-09) — the first send fires at 22:00 UTC today, since that
--      time has not yet passed.
--
-- Recipients (admin + manager roles) and email content are unchanged — that
-- logic lives in the send-labor-day-promo-email edge function, not touched
-- here. Confirmed via direct query: 4 admins + 6 managers, all real
-- addresses, will receive it.
--
-- Untouched: everything else — bookings/invoiced formulas, Dealer/Rep
-- Reporting, Open SO, all other cron jobs.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trigger_send_labor_day_promo_email()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_key  text;
  supabase_url text := 'https://tcqpseblcwqjopbocfmr.supabase.co';
  today_et     date := (NOW() AT TIME ZONE 'America/New_York')::date;
  cutoff_et    date := '2026-09-14';
BEGIN
  -- Guard 1: skip entirely (no HTTP call) once past the cutoff date, even if
  -- this cron job is still scheduled/active.
  IF today_et > cutoff_et THEN
    RAISE NOTICE 'send-labor-day-promo-email: past cutoff (% ET, today is %) — skipping', cutoff_et, today_et;
    RETURN;
  END IF;

  SELECT decrypted_secret INTO service_key
  FROM vault.decrypted_secrets
  WHERE name = 'email_queue_service_role_key'
  LIMIT 1;

  -- send-labor-day-promo-email has verify_jwt=false, so the anon key is sufficient.
  IF service_key IS NULL THEN
    service_key := 'sb_publishable_CE2Pld7FgCecomxJRTRUOw_aI2z9Bko';
  END IF;

  PERFORM net.http_post(
    url     := supabase_url || '/functions/v1/send-labor-day-promo-email',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- ── Schedule: 22:00 UTC = 6:00 PM EDT every day, effective immediately ───────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-labor-day-promo-email') THEN
    PERFORM cron.unschedule('send-labor-day-promo-email');
  END IF;
END $$;

SELECT cron.schedule(
  'send-labor-day-promo-email',
  '0 22 * * *',
  $$ SELECT public.trigger_send_labor_day_promo_email(); $$
);

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- 1. Job is now live:
--    SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'send-labor-day-promo-email';
--
-- 2. First send fires today at 22:00 UTC (6:00 PM ET) — check run history after that time:
--    SELECT j.jobname, r.status, r.start_time, r.return_message
--    FROM cron.job_run_details r JOIN cron.job j ON j.jobid = r.jobid
--    WHERE j.jobname = 'send-labor-day-promo-email'
--    ORDER BY r.start_time DESC LIMIT 5;
--
-- 3. Will stop sending after 2026-09-14 (function no-ops from 2026-09-15 on,
--    even though the cron job itself stays scheduled — matches the original
--    "hard date guard, not an unschedule" design). To also remove the cron
--    entry entirely after that date:
--    SELECT cron.unschedule('send-labor-day-promo-email');
-- ══════════════════════════════════════════════════════════════════════════════
