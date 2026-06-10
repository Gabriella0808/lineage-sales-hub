-- 1. Add account_type to crm_accounts
ALTER TABLE public.crm_accounts
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'prospect';

-- Backfill from old lifecycle_stage
UPDATE public.crm_accounts
SET account_type = CASE WHEN lifecycle_stage = 'closed_won' THEN 'dealer' ELSE 'prospect' END;

CREATE INDEX IF NOT EXISTS idx_crm_accounts_account_type ON public.crm_accounts(account_type);

-- 2. Link dealers back to crm account of origin
ALTER TABLE public.dealers
  ADD COLUMN IF NOT EXISTS crm_account_id uuid REFERENCES public.crm_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dealers_crm_account_id ON public.dealers(crm_account_id);

-- 3. Trigger function: when account_type flips to 'dealer', create dealer + check-in
CREATE OR REPLACE FUNCTION public.convert_crm_account_to_dealer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_dealer_id uuid;
  actor_id uuid;
  full_address text;
BEGIN
  IF NEW.account_type <> 'dealer' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.account_type = 'dealer' THEN
    RETURN NEW;
  END IF;

  -- Find existing converted dealer for this account, if any
  SELECT id INTO new_dealer_id FROM public.dealers
   WHERE crm_account_id = NEW.id LIMIT 1;

  IF new_dealer_id IS NULL THEN
    INSERT INTO public.dealers (
      name, rep_id, city, state, phone, email, website,
      street_address, first_name, last_name, notes,
      status, source, crm_account_id
    ) VALUES (
      NEW.company_name, NEW.assigned_rep_id, NEW.city, NEW.state,
      NEW.main_phone, NEW.email, NEW.website,
      NEW.street_1, NEW.contact_first_name, NEW.contact_last_name, NEW.notes,
      'active', 'crm', NEW.id
    )
    RETURNING id INTO new_dealer_id;
  END IF;

  actor_id := COALESCE(auth.uid(), NEW.created_by);

  IF actor_id IS NOT NULL THEN
    full_address := concat_ws(', ', NEW.street_1, NEW.city, NEW.state, NEW.zip);
    INSERT INTO public.dealer_check_ins (
      dealer_id, user_id, visit_date, log_type, outcome, notes, brand
    ) VALUES (
      new_dealer_id, actor_id, CURRENT_DATE, 'conversion', 'converted',
      'Converted from CRM account' ||
        CASE WHEN length(full_address) > 0 THEN ' — ' || full_address ELSE '' END,
      NEW.brand
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_account_convert_to_dealer ON public.crm_accounts;
CREATE TRIGGER trg_crm_account_convert_to_dealer
AFTER INSERT OR UPDATE OF account_type ON public.crm_accounts
FOR EACH ROW EXECUTE FUNCTION public.convert_crm_account_to_dealer();