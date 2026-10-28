-- Feature: per-dealer annual goals ("2027 Goal" column on Dealer
-- Reporting).
--
-- Rules:
--   * The rep assigned to a dealer (dealers.rep_id, via user_reps) can
--     set that dealer's goal once - saving locks it in. After that it's
--     read-only for the rep.
--   * The dealer's manager (dealers.manager_id = current_manager_id())
--     and admins can set/change any of their dealers' goals at any
--     time, and can unlock a goal so the rep can change it again.
--
-- Keyed on the dealer's Acctivate customer ID (lower/trimmed) - the same
-- key the reporting RPCs return as customer_id, and unique across
-- active Acctivate dealers. Writes go only through the SECURITY DEFINER
-- functions below, which enforce the rules; the table itself is
-- read-only to authenticated users.

BEGIN;

CREATE TABLE public.dealer_annual_goals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_key text NOT NULL,
  goal_year    integer NOT NULL,
  amount       numeric(14,2) NOT NULL CHECK (amount >= 0),
  locked       boolean NOT NULL DEFAULT true,
  set_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  locked_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_key, goal_year)
);

ALTER TABLE public.dealer_annual_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read dealer goals"
  ON public.dealer_annual_goals FOR SELECT
  TO authenticated
  USING (true);

-- Returns 'manage' (admin / dealer's manager: set any time + unlock),
-- 'rep' (dealer's assigned rep: set while unlocked), or NULL.
CREATE OR REPLACE FUNCTION public.dealer_goal_access(p_customer_key text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN public.is_admin() THEN 'manage'
    WHEN EXISTS (
      SELECT 1 FROM public.dealers d
      WHERE d.source = 'acctivate'
        AND lower(trim(d.acctivate_id)) = p_customer_key
        AND d.manager_id IS NOT NULL
        AND d.manager_id = public.current_manager_id()
    ) THEN 'manage'
    WHEN EXISTS (
      SELECT 1 FROM public.dealers d
      JOIN public.user_reps ur ON ur.rep_id = d.rep_id
      WHERE d.source = 'acctivate'
        AND lower(trim(d.acctivate_id)) = p_customer_key
        AND ur.user_id = auth.uid()
    ) THEN 'rep'
    ELSE NULL
  END
$function$;

CREATE OR REPLACE FUNCTION public.set_dealer_annual_goal(p_customer_id text, p_year integer, p_amount numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key    text := lower(trim(p_customer_id));
  v_access text := public.dealer_goal_access(v_key);
  v_locked boolean;
BEGIN
  IF v_access IS NULL THEN
    RAISE EXCEPTION 'You can only set goals for your own dealers';
  END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'Goal must be zero or more';
  END IF;

  SELECT g.locked INTO v_locked
  FROM public.dealer_annual_goals g
  WHERE g.customer_key = v_key AND g.goal_year = p_year;

  IF v_access = 'rep' AND v_locked THEN
    RAISE EXCEPTION 'This goal is locked in - ask your manager to unlock it';
  END IF;

  INSERT INTO public.dealer_annual_goals (customer_key, goal_year, amount, locked, set_by, locked_at)
  VALUES (v_key, p_year, p_amount, true, auth.uid(), now())
  ON CONFLICT (customer_key, goal_year) DO UPDATE
    SET amount = EXCLUDED.amount, locked = true, set_by = EXCLUDED.set_by,
        locked_at = now(), updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.unlock_dealer_annual_goal(p_customer_id text, p_year integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key text := lower(trim(p_customer_id));
BEGIN
  IF public.dealer_goal_access(v_key) IS DISTINCT FROM 'manage' THEN
    RAISE EXCEPTION 'Only an admin or the dealer''s manager can unlock a goal';
  END IF;

  UPDATE public.dealer_annual_goals
     SET locked = false, locked_at = NULL, updated_at = now()
   WHERE customer_key = v_key AND goal_year = p_year;
END;
$function$;

-- Which dealers the current user can edit, for the UI. One call per
-- page load instead of one dealer_goal_access() per row.
CREATE OR REPLACE FUNCTION public.my_dealer_goal_access()
 RETURNS TABLE(customer_key text, access text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (lower(trim(d.acctivate_id)))
    lower(trim(d.acctivate_id)),
    CASE
      WHEN public.is_admin() THEN 'manage'
      WHEN d.manager_id IS NOT NULL AND d.manager_id = public.current_manager_id() THEN 'manage'
      ELSE 'rep'
    END
  FROM public.dealers d
  WHERE d.source = 'acctivate'
    AND NULLIF(trim(d.acctivate_id), '') IS NOT NULL
    AND (
      public.is_admin()
      OR (d.manager_id IS NOT NULL AND d.manager_id = public.current_manager_id())
      OR d.rep_id IN (SELECT ur.rep_id FROM public.user_reps ur WHERE ur.user_id = auth.uid())
    )
  ORDER BY lower(trim(d.acctivate_id)),
    CASE WHEN public.is_admin() OR (d.manager_id IS NOT NULL AND d.manager_id = public.current_manager_id()) THEN 0 ELSE 1 END
$function$;

REVOKE ALL ON FUNCTION public.dealer_goal_access(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_dealer_annual_goal(text, integer, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unlock_dealer_annual_goal(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_dealer_goal_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dealer_goal_access(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_dealer_annual_goal(text, integer, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_dealer_annual_goal(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_dealer_goal_access() TO authenticated;

COMMIT;
