-- The trigger_clearance_weekly_report function silently returned when the vault
-- secret 'email_queue_service_role_key' was missing. Since notify-weekly-clearance
-- has verify_jwt=false, the publishable anon key is sufficient as a fallback.

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

  -- notify-weekly-clearance has verify_jwt=false so the anon key is sufficient.
  IF service_key IS NULL THEN
    service_key := 'sb_publishable_CE2Pld7FgCecomxJRTRUOw_aI2z9Bko';
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
