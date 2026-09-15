-- ══════════════════════════════════════════════════════════════════════════════
-- Extend the Labor Day Promo (LD26) daily email cron cutoff by one day.
--
-- 20260913001100_schedule_labor_day_promo_email.sql set cutoff_et to
-- 2026-09-14, matching the reporting-page date range at the time. The
-- reporting page's data window has since been widened to also count Sep 15
-- (see the LaborDayPromoPage.tsx REPORTING_END change), so the daily email
-- should keep sending through today, Sep 15, rather than skip it.
--
-- Only cutoff_et changes here. Recipients, send time (22:00 UTC / 6:00 PM
-- ET), and email content/logic are unchanged.
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
  cutoff_et    date := '2026-09-15';
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

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- 1. Confirm the new cutoff took effect:
--    SELECT prosrc FROM pg_proc WHERE proname = 'trigger_send_labor_day_promo_email';
--
-- 2. Tonight's 22:00 UTC (6:00 PM ET) run should now succeed instead of
--    skipping — check run history after that time:
--    SELECT j.jobname, r.status, r.start_time, r.return_message
--    FROM cron.job_run_details r JOIN cron.job j ON j.jobid = r.jobid
--    WHERE j.jobname = 'send-labor-day-promo-email'
--    ORDER BY r.start_time DESC LIMIT 3;
--
-- 3. From Sep 16 on, the function will no-op again (today_et > cutoff_et),
--    same "hard date guard, cron job stays scheduled" design as before.
-- ══════════════════════════════════════════════════════════════════════════════
