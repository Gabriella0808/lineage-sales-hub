CREATE OR REPLACE FUNCTION public.log_field_check_in(
  p_dealer_id uuid,
  p_dealer_name text,
  p_visit_date date,
  p_log_type text,
  p_new_placement text DEFAULT NULL,
  p_brand text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_street_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_website text DEFAULT NULL,
  p_rep_id uuid DEFAULT NULL,
  p_manager_id uuid DEFAULT NULL,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_crm_account_id uuid DEFAULT NULL
)
RETURNS public.dealer_check_ins
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_check_in public.dealer_check_ins%ROWTYPE;
  v_source text := NULLIF(trim(COALESCE(p_source, 'field_only')), '');
  v_crm_account_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to log a check-in';
  END IF;

  IF p_dealer_id IS NULL THEN
    RAISE EXCEPTION 'Dealer is required to log a check-in';
  END IF;

  IF p_dealer_name IS NULL OR length(trim(p_dealer_name)) = 0 THEN
    RAISE EXCEPTION 'Dealer name is required to log a check-in';
  END IF;

  IF p_log_type IS NULL OR length(trim(p_log_type)) = 0 THEN
    RAISE EXCEPTION 'Log type is required to log a check-in';
  END IF;

  IF p_crm_account_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.crm_accounts WHERE id = p_crm_account_id
  ) THEN
    v_crm_account_id := p_crm_account_id;
  ELSE
    v_crm_account_id := NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.dealers WHERE id = p_dealer_id) THEN
    INSERT INTO public.dealers (
      id,
      name,
      status,
      source,
      street_address,
      city,
      state,
      phone,
      email,
      website,
      rep_id,
      manager_id,
      lat,
      lng,
      crm_account_id
    ) VALUES (
      p_dealer_id,
      trim(p_dealer_name),
      'active',
      COALESCE(v_source, 'field_only'),
      NULLIF(trim(COALESCE(p_street_address, '')), ''),
      NULLIF(trim(COALESCE(p_city, '')), ''),
      NULLIF(trim(COALESCE(p_state, '')), ''),
      NULLIF(trim(COALESCE(p_phone, '')), ''),
      NULLIF(trim(COALESCE(p_email, '')), ''),
      NULLIF(trim(COALESCE(p_website, '')), ''),
      p_rep_id,
      p_manager_id,
      p_lat,
      p_lng,
      v_crm_account_id
    );
  ELSE
    UPDATE public.dealers
       SET name = COALESCE(NULLIF(trim(p_dealer_name), ''), name),
           source = COALESCE(v_source, source),
           street_address = COALESCE(NULLIF(trim(COALESCE(p_street_address, '')), ''), street_address),
           city = COALESCE(NULLIF(trim(COALESCE(p_city, '')), ''), city),
           state = COALESCE(NULLIF(trim(COALESCE(p_state, '')), ''), state),
           phone = COALESCE(NULLIF(trim(COALESCE(p_phone, '')), ''), phone),
           email = COALESCE(NULLIF(trim(COALESCE(p_email, '')), ''), email),
           website = COALESCE(NULLIF(trim(COALESCE(p_website, '')), ''), website),
           rep_id = COALESCE(rep_id, p_rep_id),
           manager_id = COALESCE(manager_id, p_manager_id),
           lat = COALESCE(lat, p_lat),
           lng = COALESCE(lng, p_lng),
           crm_account_id = COALESCE(crm_account_id, v_crm_account_id)
     WHERE id = p_dealer_id;
  END IF;

  INSERT INTO public.dealer_check_ins (
    dealer_id,
    user_id,
    visit_date,
    outcome,
    log_type,
    new_placement,
    brand,
    notes
  ) VALUES (
    p_dealer_id,
    v_user_id,
    COALESCE(p_visit_date, CURRENT_DATE),
    p_log_type,
    p_log_type,
    NULLIF(trim(COALESCE(p_new_placement, '')), ''),
    NULLIF(trim(COALESCE(p_brand, '')), ''),
    NULLIF(trim(COALESCE(p_notes, '')), '')
  )
  RETURNING * INTO v_check_in;

  RETURN v_check_in;
END;
$$;

REVOKE ALL ON FUNCTION public.log_field_check_in(uuid, text, date, text, text, text, text, text, text, text, text, text, text, text, uuid, uuid, double precision, double precision, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_field_check_in(uuid, text, date, text, text, text, text, text, text, text, text, text, text, text, uuid, uuid, double precision, double precision, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_field_check_in(uuid, text, date, text, text, text, text, text, text, text, text, text, text, text, uuid, uuid, double precision, double precision, uuid) TO service_role;

DROP POLICY IF EXISTS "Users insert own check-ins" ON public.dealer_check_ins;
CREATE POLICY "Users insert own check-ins"
ON public.dealer_check_ins
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users read own check-ins" ON public.dealer_check_ins;
CREATE POLICY "Users read own check-ins"
ON public.dealer_check_ins
FOR SELECT
TO authenticated
USING (user_id = auth.uid());