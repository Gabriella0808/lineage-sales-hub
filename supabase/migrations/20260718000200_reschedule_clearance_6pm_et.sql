-- Reschedule clearance weekly report to 6 PM ET (22:00 UTC, EDT = UTC-4).
-- Replaces the 7 PM ET schedule set in 20260717000200.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-weekly-clearance-friday-7pm-et') THEN
    PERFORM cron.unschedule('notify-weekly-clearance-friday-7pm-et');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-weekly-clearance-friday-6pm-et') THEN
    PERFORM cron.unschedule('notify-weekly-clearance-friday-6pm-et');
  END IF;
END $$;

-- 6 PM EDT = 22:00 UTC (EDT is UTC-4, in effect during summer Fridays).
SELECT cron.schedule(
  'notify-weekly-clearance-friday-6pm-et',
  '0 22 * * 5',
  $$ SELECT public.trigger_clearance_weekly_report(); $$
);
