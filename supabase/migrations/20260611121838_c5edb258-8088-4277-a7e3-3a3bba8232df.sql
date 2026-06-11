
CREATE OR REPLACE FUNCTION public.sync_crm_account_manager_from_rep()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  rep_mgr uuid;
BEGIN
  IF NEW.assigned_rep_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_rep_id IS DISTINCT FROM OLD.assigned_rep_id) THEN
    SELECT manager_id INTO rep_mgr FROM public.sales_reps WHERE id = NEW.assigned_rep_id;
    IF rep_mgr IS NOT NULL THEN
      NEW.assigned_manager_id := rep_mgr;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_crm_account_manager_from_rep ON public.crm_accounts;
CREATE TRIGGER trg_sync_crm_account_manager_from_rep
BEFORE INSERT OR UPDATE OF assigned_rep_id ON public.crm_accounts
FOR EACH ROW EXECUTE FUNCTION public.sync_crm_account_manager_from_rep();

-- Backfill existing rows
UPDATE public.crm_accounts a
SET assigned_manager_id = r.manager_id
FROM public.sales_reps r
WHERE a.assigned_rep_id = r.id
  AND r.manager_id IS NOT NULL
  AND a.assigned_manager_id IS DISTINCT FROM r.manager_id;
