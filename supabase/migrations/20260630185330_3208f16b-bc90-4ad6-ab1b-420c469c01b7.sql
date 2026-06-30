-- 1) Update CRM→dealer conversion trigger to copy assigned_manager_id
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
    -- Keep manager_id in sync on updates too
    UPDATE public.dealers
       SET manager_id = COALESCE(NEW.assigned_manager_id, manager_id),
           rep_id     = COALESCE(NEW.assigned_rep_id, rep_id)
     WHERE crm_account_id = NEW.id;
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
      name, rep_id, manager_id, city, state, phone, email, website,
      street_address, first_name, last_name, notes, status, source, crm_account_id
    ) VALUES (
      NEW.company_name, NEW.assigned_rep_id, NEW.assigned_manager_id, NEW.city, NEW.state,
      NEW.main_phone, NEW.email, NEW.website,
      NEW.street_1, NEW.contact_first_name, NEW.contact_last_name, NEW.notes,
      'active', 'crm', NEW.id
    );
  ELSE
    UPDATE public.dealers
       SET crm_account_id = NEW.id,
           manager_id = COALESCE(manager_id, NEW.assigned_manager_id),
           rep_id     = COALESCE(rep_id, NEW.assigned_rep_id)
     WHERE id = new_dealer_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Backfill manager_id (and rep_id) on dealers from their linked CRM account
UPDATE public.dealers d
   SET manager_id = a.assigned_manager_id
  FROM public.crm_accounts a
 WHERE d.crm_account_id = a.id
   AND d.manager_id IS NULL
   AND a.assigned_manager_id IS NOT NULL;

UPDATE public.dealers d
   SET rep_id = a.assigned_rep_id
  FROM public.crm_accounts a
 WHERE d.crm_account_id = a.id
   AND d.rep_id IS NULL
   AND a.assigned_rep_id IS NOT NULL;