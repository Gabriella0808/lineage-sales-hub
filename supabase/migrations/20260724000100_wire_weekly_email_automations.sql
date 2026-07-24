-- Track the two weekly email automation cron jobs in code.
--
-- notify-weekly-checkins:     was 0 21 * * 5 (5 PM ET) → now 0 22 * * 5 (6 PM ET)
-- send-weekly-review-digest:  confirmed at 0 22 * * 5 (6 PM ET), recreated idempotently
--
-- Both functions have verify_jwt=false so the anon key is sufficient as a fallback,
-- matching the pattern used by trigger_clearance_weekly_report().
--
-- ── Manual trigger (run in Supabase SQL editor to send immediately) ───────────
--   SELECT public.trigger_notify_weekly_checkins();
--   SELECT public.trigger_send_weekly_review_digest();
--
-- ── Verification (check schedule and latest run status) ──────────────────────
--   SELECT jobname, schedule, command, active
--   FROM cron.job
--   WHERE jobname IN (
--     'notify-weekly-checkins',
--     'send-weekly-review-digest',
--     'notify-weekly-clearance-friday-6pm-et'
--   )
--   ORDER BY jobname;
--
--   SELECT j.jobname, r.status, r.start_time, r.end_time, r.return_message
--   FROM cron.job_run_details r
--   JOIN cron.job j ON j.jobid = r.jobid
--   WHERE j.jobname IN (
--     'notify-weekly-checkins',
--     'send-weekly-review-digest'
--   )
--   ORDER BY r.start_time DESC
--   LIMIT 20;
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Trigger function: notify-weekly-checkins ───────────────────────────────

CREATE OR REPLACE FUNCTION public.trigger_notify_weekly_checkins()
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

  -- notify-weekly-checkins has verify_jwt=false so the anon key is sufficient.
  IF service_key IS NULL THEN
    service_key := 'sb_publishable_CE2Pld7FgCecomxJRTRUOw_aI2z9Bko';
  END IF;

  PERFORM net.http_post(
    url     := supabase_url || '/functions/v1/notify-weekly-checkins',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- ── 2. Trigger function: send-weekly-review-digest ────────────────────────────

CREATE OR REPLACE FUNCTION public.trigger_send_weekly_review_digest()
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

  -- send-weekly-review-digest has verify_jwt=false so the anon key is sufficient.
  IF service_key IS NULL THEN
    service_key := 'sb_publishable_CE2Pld7FgCecomxJRTRUOw_aI2z9Bko';
  END IF;

  PERFORM net.http_post(
    url     := supabase_url || '/functions/v1/send-weekly-review-digest',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- ── 3. Reschedule notify-weekly-checkins: 5 PM ET → 6 PM ET ──────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-weekly-checkins') THEN
    PERFORM cron.unschedule('notify-weekly-checkins');
  END IF;
END $$;

SELECT cron.schedule(
  'notify-weekly-checkins',
  '0 22 * * 5',
  $$ SELECT public.trigger_notify_weekly_checkins(); $$
);

-- ── 4. Confirm send-weekly-review-digest at 6 PM ET (idempotent) ─────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-weekly-review-digest') THEN
    PERFORM cron.unschedule('send-weekly-review-digest');
  END IF;
END $$;

SELECT cron.schedule(
  'send-weekly-review-digest',
  '0 22 * * 5',
  $$ SELECT public.trigger_send_weekly_review_digest(); $$
);
