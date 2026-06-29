CREATE OR REPLACE FUNCTION public.convert_crm_account_to_dealer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_dealer_id uuid;
BEGIN
  IF NEW.account_type <> 'dealer' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.account_type = 'dealer' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO new_dealer_id
  FROM public.dealers
  WHERE crm_account_id = NEW.id
  LIMIT 1;

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
    );
  END IF;

  RETURN NEW;
END;
$$;

DELETE FROM public.dealer_check_ins
WHERE log_type = 'conversion'
   OR outcome = 'converted'
   OR notes ILIKE 'Converted from CRM account%';