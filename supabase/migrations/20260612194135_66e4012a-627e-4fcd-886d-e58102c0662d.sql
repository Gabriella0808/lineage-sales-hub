DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-weekly-clearance-friday-5pm-et') THEN
    PERFORM cron.unschedule('notify-weekly-clearance-friday-5pm-et');
  END IF;
END $$;