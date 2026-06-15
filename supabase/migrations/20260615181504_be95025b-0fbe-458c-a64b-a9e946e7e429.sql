CREATE OR REPLACE FUNCTION public.convert_crm_account_to_dealer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_dealer_id uuid;
  skip_flag text;
BEGIN
  IF NEW.account_type <> 'dealer' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.account_type = 'dealer' THEN
    RETURN NEW;
  END IF;

  BEGIN
    skip_flag := current_setting('app.skip_crm_to_dealer', true);
  EXCEPTION WHEN OTHERS THEN
    skip_flag := NULL;
  END;
  IF skip_flag = 'on' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO new_dealer_id FROM public.dealers WHERE crm_account_id = NEW.id LIMIT 1;

  IF new_dealer_id IS NULL THEN
    SELECT id INTO new_dealer_id FROM public.dealers WHERE lower(name) = lower(NEW.company_name) LIMIT 1;
  END IF;

  IF new_dealer_id IS NULL THEN
    INSERT INTO public.dealers (
      name, rep_id, city, state, phone, email, website,
      street_address, first_name, last_name, notes, status, source, crm_account_id
    ) VALUES (
      NEW.company_name, NEW.assigned_rep_id, NEW.city, NEW.state,
      NEW.main_phone, NEW.email, NEW.website,
      NEW.street_1, NEW.contact_first_name, NEW.contact_last_name, NEW.notes,
      'active', 'crm', NEW.id
    );
  ELSE
    UPDATE public.dealers SET crm_account_id = NEW.id
    WHERE id = new_dealer_id AND crm_account_id IS DISTINCT FROM NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_crm_account_for_dealer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  acct_id uuid;
BEGIN
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

DROP TRIGGER IF EXISTS trg_dealer_ensure_crm_account ON public.dealers;
CREATE TRIGGER trg_dealer_ensure_crm_account
BEFORE INSERT ON public.dealers
FOR EACH ROW EXECUTE FUNCTION public.ensure_crm_account_for_dealer();

DO $$
DECLARE
  dr public.dealers%ROWTYPE;
  new_acct uuid;
BEGIN
  PERFORM set_config('app.skip_crm_to_dealer', 'on', true);

  UPDATE public.dealers AS x
  SET crm_account_id = a.id
  FROM public.crm_accounts a
  WHERE x.crm_account_id IS NULL
    AND lower(a.company_name) = lower(x.name);

  UPDATE public.crm_accounts AS a
  SET account_type = 'dealer'
  FROM public.dealers x
  WHERE x.crm_account_id = a.id AND a.account_type <> 'dealer';

  FOR dr IN SELECT * FROM public.dealers WHERE crm_account_id IS NULL LOOP
    INSERT INTO public.crm_accounts (
      company_name, account_type, lifecycle_stage, status,
      assigned_rep_id, assigned_manager_id,
      contact_first_name, contact_last_name,
      main_phone, email, website,
      street_1, city, state, notes
    ) VALUES (
      dr.name, 'dealer', 'customer', 'active',
      dr.rep_id, dr.manager_id,
      dr.first_name, dr.last_name,
      dr.phone, dr.email, dr.website,
      dr.street_address, dr.city, dr.state, dr.notes
    ) RETURNING id INTO new_acct;

    UPDATE public.dealers SET crm_account_id = new_acct WHERE id = dr.id;
  END LOOP;

  PERFORM set_config('app.skip_crm_to_dealer', 'off', true);
END $$;