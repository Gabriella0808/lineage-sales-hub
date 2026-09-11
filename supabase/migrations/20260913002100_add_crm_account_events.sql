-- ══════════════════════════════════════════════════════════════════════════════
-- Prospect Reporting, part 1: observational event log for crm_accounts.
--
-- crm_accounts has no change history — only current-state columns plus
-- updated_at (which changes on ANY edit, not just assignment/status/
-- conversion). This makes "added/assigned/converted/deleted this week"
-- impossible to compute accurately today. This migration adds a small,
-- purely observational audit table populated by triggers, so those metrics
-- become computable going forward.
--
-- Safety requirements (per explicit approval):
--   - Logging must NEVER break the actual create/update/delete/convert
--     flow. The whole logging block is wrapped in EXCEPTION WHEN OTHERS
--     and only RAISE WARNING on failure — the triggering transaction
--     always succeeds regardless of what happens to the log.
--   - SECURITY DEFINER functions get an explicit search_path.
--   - account_id on crm_account_events has NO foreign key to crm_accounts
--     (a plain uuid reference/snapshot only), so a deleted account's event
--     rows are never at risk of an FK failure or cascade — this is exactly
--     what lets the 'deleted' event survive the row it describes.
--
-- Limitation (documented, not hidden): this only starts counting from the
-- moment it ships. "Added this week" can still be computed accurately for
-- any past week directly from crm_accounts.created_at (that column already
-- existed). "Assigned/converted/deleted this week" for weeks before this
-- migration cannot be backfilled and will correctly show 0 — there is no
-- data to recover. The reporting UI will label this explicitly.
--
-- Nothing about the existing conversion trigger (convert_crm_account_to_
-- dealer) or delete flow (useDeleteAccount) changes — this adds a second,
-- independent AFTER trigger alongside the existing ones.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.crm_account_events (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Plain reference, NOT a foreign key — must survive account deletion.
  account_id             uuid,
  event_type             text NOT NULL CHECK (event_type IN ('created', 'assigned', 'converted', 'status_changed', 'deleted')),
  company_name_snapshot  text,
  from_value             text,
  to_value               text,
  manager_id             uuid,   -- denormalized at time of event, not FK-enforced
  rep_id                 uuid,   -- denormalized at time of event, not FK-enforced
  occurred_at            timestamptz NOT NULL DEFAULT now(),
  created_by             uuid
);

CREATE INDEX IF NOT EXISTS idx_crm_account_events_account_id  ON public.crm_account_events (account_id);
CREATE INDEX IF NOT EXISTS idx_crm_account_events_event_type  ON public.crm_account_events (event_type);
CREATE INDEX IF NOT EXISTS idx_crm_account_events_occurred_at ON public.crm_account_events (occurred_at);
CREATE INDEX IF NOT EXISTS idx_crm_account_events_manager_id  ON public.crm_account_events (manager_id);
CREATE INDEX IF NOT EXISTS idx_crm_account_events_rep_id      ON public.crm_account_events (rep_id);

ALTER TABLE public.crm_account_events ENABLE ROW LEVEL SECURITY;

-- Same read access as crm_accounts itself. No client INSERT/UPDATE/DELETE
-- policy is needed or added — only the SECURITY DEFINER trigger function
-- below writes to this table.
CREATE POLICY "Admins and managers can view account events"
  ON public.crm_account_events
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE OR REPLACE FUNCTION public.log_crm_account_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.crm_account_events
        (account_id, event_type, company_name_snapshot, manager_id, rep_id, created_by)
      VALUES
        (NEW.id, 'created', NEW.company_name, NEW.assigned_manager_id, NEW.assigned_rep_id, NEW.created_by);

    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.assigned_manager_id IS DISTINCT FROM OLD.assigned_manager_id
         OR NEW.assigned_rep_id IS DISTINCT FROM OLD.assigned_rep_id THEN
        INSERT INTO public.crm_account_events
          (account_id, event_type, company_name_snapshot, from_value, to_value, manager_id, rep_id, created_by)
        VALUES
          (NEW.id, 'assigned', NEW.company_name,
           COALESCE(OLD.assigned_manager_id::text, '') || '/' || COALESCE(OLD.assigned_rep_id::text, ''),
           COALESCE(NEW.assigned_manager_id::text, '') || '/' || COALESCE(NEW.assigned_rep_id::text, ''),
           NEW.assigned_manager_id, NEW.assigned_rep_id, auth.uid());
      END IF;

      IF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO public.crm_account_events
          (account_id, event_type, company_name_snapshot, from_value, to_value, manager_id, rep_id, created_by)
        VALUES
          (NEW.id, 'status_changed', NEW.company_name, OLD.status, NEW.status,
           NEW.assigned_manager_id, NEW.assigned_rep_id, auth.uid());
      END IF;

      IF OLD.account_type IS DISTINCT FROM 'dealer' AND NEW.account_type = 'dealer' THEN
        INSERT INTO public.crm_account_events
          (account_id, event_type, company_name_snapshot, manager_id, rep_id, created_by)
        VALUES
          (NEW.id, 'converted', NEW.company_name, NEW.assigned_manager_id, NEW.assigned_rep_id, auth.uid());
      END IF;

    ELSIF TG_OP = 'DELETE' THEN
      INSERT INTO public.crm_account_events
        (account_id, event_type, company_name_snapshot, manager_id, rep_id, created_by)
      VALUES
        (OLD.id, 'deleted', OLD.company_name, OLD.assigned_manager_id, OLD.assigned_rep_id, auth.uid());
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Never let event logging break the real create/update/delete flow.
    RAISE WARNING 'crm_account_events logging failed for account %: %', COALESCE(NEW.id, OLD.id), SQLERRM;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_crm_account_events ON public.crm_accounts;
CREATE TRIGGER trg_crm_account_events
AFTER INSERT OR UPDATE OR DELETE ON public.crm_accounts
FOR EACH ROW EXECUTE FUNCTION public.log_crm_account_event();

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION (run after applying, inside a transaction that gets rolled
-- back — no permanent test rows):
--
-- BEGIN;
--   INSERT INTO crm_accounts (company_name, account_type, status, created_by)
--     VALUES ('__TEST_EVENT_LOG__', 'prospect', 'active', NULL) RETURNING id;
--   -- expect 1 new crm_account_events row, event_type='created'
--   UPDATE crm_accounts SET status = 'follow_up' WHERE company_name = '__TEST_EVENT_LOG__';
--   -- expect 1 new row, event_type='status_changed', from_value='active', to_value='follow_up'
--   DELETE FROM crm_accounts WHERE company_name = '__TEST_EVENT_LOG__';
--   -- expect 1 new row, event_type='deleted', account_id still populated
--   SELECT * FROM crm_account_events WHERE company_name_snapshot = '__TEST_EVENT_LOG__' ORDER BY occurred_at;
-- ROLLBACK;
-- ══════════════════════════════════════════════════════════════════════════════
