-- Add idempotency_key to email_send_log so send-transactional-email can
-- detect and skip duplicate enqueues before a message ever enters the queue.
--
-- Without this, every call to send-transactional-email generates a fresh
-- crypto.randomUUID() messageId, so two calls with the same logical
-- idempotencyKey (e.g. "task-assigned-<taskId>-<userId>") produce two
-- independent queue messages that both get sent.
--
-- The fix adds a pre-enqueue check: if a 'sent' or 'pending' row already
-- exists for this idempotency_key, the function returns early without
-- enqueuing.  The unique partial index on 'sent' is a DB-level safety net
-- for race conditions.

ALTER TABLE public.email_send_log
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE INDEX IF NOT EXISTS idx_email_send_log_idempotency_key
  ON public.email_send_log (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Only one 'sent' row per idempotency_key ever.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_idempotency_sent_unique
  ON public.email_send_log (idempotency_key)
  WHERE status = 'sent' AND idempotency_key IS NOT NULL;
