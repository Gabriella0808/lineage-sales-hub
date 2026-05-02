ALTER TABLE public.email_send_log
  ADD COLUMN IF NOT EXISTS resurrect_attempts integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_email_send_log_template_status_created
  ON public.email_send_log (template_name, status, created_at DESC);

UPDATE public.email_send_state
  SET transactional_email_ttl_minutes = 120, updated_at = now()
  WHERE id = 1;