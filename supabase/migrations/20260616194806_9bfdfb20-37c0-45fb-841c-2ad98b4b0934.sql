
CREATE OR REPLACE FUNCTION public.ensure_crm_account_for_dealer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  acct_id uuid;
BEGIN
  -- Skip entirely for prospect shell dealers: those are created just so
  -- dealer_check_ins.dealer_id has a valid FK target. The underlying
  -- crm_accounts row must stay account_type='prospect'.
  IF NEW.source = 'crm_prospect' THEN
    RETURN NEW;
  END IF;

  IF NEW.crm_account_id IS NOT NULL THEN RETURN NEW; END IF;

  SELECT id INTO acct_id FROM public.crm_accounts
   WHERE lower(company_name) = lower(NEW.name) LIMIT 1;

  IF acct_id IS NULL THEN
    PERFORM set_config('app.skip_crm_to_dealer', 'on', true);
    INSERT INTO public.crm_accounts (
      company_name, account_type, lifecycle_stage, status,
      assigned_rep_id, assigned_manager_id,
      contact_first_name, contact_last_name,
      main_phone, email, website,
      street_1, city, state, notes
    ) VALUES (
      NEW.name, 'dealer', 'customer', 'active',
      NEW.rep_id, NEW.manager_id,
      NEW.first_name, NEW.last_name,
      NEW.phone, NEW.email, NEW.website,
      NEW.street_address, NEW.city, NEW.state, NEW.notes
    ) RETURNING id INTO acct_id;
    PERFORM set_config('app.skip_crm_to_dealer', 'off', true);
  ELSE
    UPDATE public.crm_accounts SET account_type = 'dealer'
     WHERE id = acct_id AND account_type <> 'dealer';
  END IF;

  NEW.crm_account_id := acct_id;
  RETURN NEW;
END;
$function$;

-- Revert the two CRM accounts that were accidentally promoted to 'dealer'
-- by the previous prospect check-in insert.
UPDATE public.crm_accounts
SET account_type = 'prospect'
WHERE id IN (
  '89a09df1-eab0-4b19-abdf-9f29c5dd8841',
  '5f4d2d40-5dc5-4046-9cc5-ddd98d030aeb'
);
