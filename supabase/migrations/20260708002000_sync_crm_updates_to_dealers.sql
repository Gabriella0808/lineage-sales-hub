-- Fix: sync crm_accounts edits to linked dealers rows for ALL account types.
-- Previously the trigger only kept manager_id/rep_id in sync when account_type
-- was already 'dealer'. This left prospects with a linked dealers row showing
-- stale data in Field Check-ins whenever the CRM was edited.
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
  -- On every UPDATE, sync all editable fields to the linked dealers row.
  -- This covers both prospects and dealers so Field Check-ins always reflects
  -- whatever the user last saved in the CRM.
  IF TG_OP = 'UPDATE' THEN
    UPDATE public.dealers
       SET name       = NEW.company_name,
           first_name = NEW.contact_first_name,
           last_name  = NEW.contact_last_name,
           phone      = NEW.main_phone,
           email      = NEW.email,
           website    = NEW.website,
           notes      = NEW.notes,
           manager_id = COALESCE(NEW.assigned_manager_id, manager_id),
           rep_id     = COALESCE(NEW.assigned_rep_id, rep_id)
     WHERE crm_account_id = NEW.id;

    -- Only continue if this UPDATE is a prospect→dealer conversion.
    IF NOT (OLD.account_type <> 'dealer' AND NEW.account_type = 'dealer') THEN
      RETURN NEW;
    END IF;
    -- Fall through to create/link a dealers row for the newly converted account.
  END IF;

  -- From here: either an INSERT with account_type='dealer', or a
  -- prospect→dealer conversion that needs a dealers row created/linked.
  IF NEW.account_type <> 'dealer' THEN
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
