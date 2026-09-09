-- Labor Day Promo (LD26) Internal Email — pg_cron schedule
--
-- Sends a daily LD26 results summary to admin/manager portal users only, at
-- 6:15 PM Eastern Time — same timing pattern as send-daily-performance-email
-- (22:15 UTC), chosen for consistency with the existing nightly email and
-- because it runs after the 5 PM ET Acctivate VM sync, so LD26 booking data
-- is current. Requested by Justin via Gabriella, 2026-09-09.
--
-- HARD CUTOFF: last valid send date is 2026-09-15 (America/New_York,
-- inclusive). Two independent guards enforce this:
--   1. This trigger function checks the date BEFORE calling the edge
--      function at all — so even if the cron job is never unscheduled,
--      no HTTP call is made after the cutoff.
--   2. The edge function itself (send-labor-day-promo-email) also checks
--      the date first thing and no-ops if past cutoff — so a stray manual
--      invocation (dashboard, curl, etc.) is equally guarded.
--
-- ── Manual trigger (run in SQL editor to send immediately) ────────────────────
--   SELECT public.trigger_send_labor_day_promo_email();
--
-- ── Dry run (returns data + recipients without sending) ───────────────────────
--   Call the edge function with body: { "dryRun": true }
--
-- ── Test send (only to the given address, never real recipients) ──────────────
--   Call the edge function with body: { "testEmail": "gabriella@lineage-collections.com" }
--
-- ── Validation ──────────────────────────────────────────────────────────────
--
--   1. Recipient list (admins + managers who will receive the email):
--      SELECT u.email, ur.role
--      FROM auth.users u
--      JOIN public.user_roles ur ON ur.user_id = u.id
--      WHERE ur.role IN ('admin', 'manager')
--        AND u.email IS NOT NULL AND u.email <> ''
--      ORDER BY ur.role, u.email;
--
--   2. LD26 totals (must match portal Labor Day Promo page, participant-driven):
--      SELECT
--        count(DISTINCT p.cust_id)                              AS participating_dealers,
--        count(DISTINCT p.cust_id) * 5000                        AS total_goal,
--        round(sum(COALESCE(s.dealer_total, 0)), 2)              AS total_sales
--      FROM public.labor_day_2026_participants p
--      LEFT JOIN (
--        SELECT upper(trim(customer_id)) AS cust_key, sum(amount) AS dealer_total
--        FROM public.v_portal_dealer_rep_reporting_lines
--        WHERE metric_type = 'bookings' AND discount_code = 'LD26'
--        GROUP BY 1
--      ) s ON s.cust_key = upper(trim(p.cust_id))
--      WHERE p.promo_slug = 'ld26' AND p.active;
--
--   3. Check cron job status:
--      SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'send-labor-day-promo-email';
--
--   4. Recent cron run history:
--      SELECT j.jobname, r.status, r.start_time, r.return_message
--      FROM cron.job_run_details r JOIN cron.job j ON j.jobid = r.jobid
--      WHERE j.jobname = 'send-labor-day-promo-email'
--      ORDER BY r.start_time DESC LIMIT 10;
--
--   5. Manually stop before the cutoff if ever needed:
--      SELECT cron.unschedule('send-labor-day-promo-email');
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Trigger function ──────────────────────────────────────────────────────────

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

-- ── Schedule: 22:15 UTC = 6:15 PM EDT (UTC-4) every day ──────────────────────
-- The cron job itself is intentionally left scheduled indefinitely (no end
-- date on cron.schedule) — the date guard above is what actually stops the
-- send after 2026-09-15, per the explicit "hard date guard" requirement.
-- Someone can still unschedule it manually later for cleanup; it's just not
-- required for correctness.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-labor-day-promo-email') THEN
    PERFORM cron.unschedule('send-labor-day-promo-email');
  END IF;
END $$;

SELECT cron.schedule(
  'send-labor-day-promo-email',
  '15 22 * * *',
  $$ SELECT public.trigger_send_labor_day_promo_email(); $$
);
