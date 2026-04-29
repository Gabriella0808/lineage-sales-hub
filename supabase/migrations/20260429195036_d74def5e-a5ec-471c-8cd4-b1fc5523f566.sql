CREATE OR REPLACE FUNCTION public.user_id_for_rep(_rep_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- 1) Try the explicit user_reps mapping
  SELECT ur.user_id
  FROM public.user_reps ur
  WHERE ur.rep_id = _rep_id
  LIMIT 1
$$;

-- Fallback that also tries to match by rep email -> auth user email
CREATE OR REPLACE FUNCTION public.user_id_for_rep_with_email_fallback(_rep_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT user_id FROM public.user_reps WHERE rep_id = _rep_id LIMIT 1),
    (SELECT u.id
       FROM public.sales_reps sr
       JOIN auth.users u ON lower(u.email) = lower(sr.email)
      WHERE sr.id = _rep_id
      LIMIT 1)
  )
$$;

GRANT EXECUTE ON FUNCTION public.user_id_for_rep(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_id_for_rep_with_email_fallback(uuid) TO authenticated;