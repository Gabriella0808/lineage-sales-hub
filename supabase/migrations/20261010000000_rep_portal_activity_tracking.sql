-- Rep Portal Activity tracking.
--
-- Root cause (confirmed by live-data audit): "Rep Login Activity" is
-- entirely sourced from sign_in_log / auth.users.last_sign_in_at, which
-- only updates on a FRESH authentication call. A rep with a persistent
-- browser session can create check-ins and read Team Updates every day
-- without ever generating a new sign-in event, which made the page look
-- wrong (e.g. Kate Jones: real check-ins today, "last login" still Oct 2).
--
-- This does NOT touch sign_in_log, auth.users.last_sign_in_at, or the
-- on_auth_user_sign_in trigger - those remain a true-login-only audit
-- trail, untouched, and get_rep_last_logins() is left completely as-is.
--
-- Instead this adds a separate, additive "last_activity_at" signal that
-- reflects real portal usage, updated via:
--   1. touch_last_activity() RPC - called by the client once per session/
--      page load, client-side throttled (see AuthContext.tsx).
--   2. A trigger on dealer_check_ins INSERT (creating a check-in is activity).
--   3. A trigger on team_post_reads INSERT (reading a team update is activity).
-- Both triggers piggyback on existing insert paths - no new client writes,
-- and both tables are only ever inserted into for genuinely new events
-- (team_post_reads is upserted with ignoreDuplicates, so a repeat view of
-- an already-read post never re-fires the trigger).

BEGIN;

-- 1. New column -------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

COMMENT ON COLUMN public.profiles.last_activity_at IS
  'Last time this user did anything meaningful in the portal (page load ping, check-in created, team update read). Distinct from auth.users.last_sign_in_at / sign_in_log, which only reflect a fresh authentication event. Powers the "Rep Portal Activity" Active/Quiet/Inactive buckets - sign_in_log remains the true-login audit trail and is untouched by this.';

-- 2. Client-called RPC: "I have the portal open and authenticated" ---------

CREATE OR REPLACE FUNCTION public.touch_last_activity()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.profiles SET last_activity_at = now() WHERE user_id = auth.uid();
$function$;

GRANT EXECUTE ON FUNCTION public.touch_last_activity() TO authenticated;

-- 3. Piggyback trigger: creating a check-in counts as activity -------------

CREATE OR REPLACE FUNCTION public.touch_activity_on_check_in()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.profiles SET last_activity_at = now() WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_check_in_touch_activity ON public.dealer_check_ins;
CREATE TRIGGER on_check_in_touch_activity
  AFTER INSERT ON public.dealer_check_ins
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_activity_on_check_in();

-- 4. Piggyback trigger: reading a team update counts as activity -----------

CREATE OR REPLACE FUNCTION public.touch_activity_on_team_post_read()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.profiles SET last_activity_at = now() WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_team_post_read_touch_activity ON public.team_post_reads;
CREATE TRIGGER on_team_post_read_touch_activity
  AFTER INSERT ON public.team_post_reads
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_activity_on_team_post_read();

-- 5. New reporting RPC - adds last_activity_at alongside last_signed_in_at -
--
-- A NEW function, not a replacement of get_rep_last_logins() - that one is
-- left completely untouched (still callable, still login-only) per the
-- explicit instruction not to alter existing login-event logic. This is a
-- byte-for-byte copy of get_rep_last_logins()'s current live access-control
-- logic (admin/manager visibility, Kate's supplemental row, the
-- admin_actor_user_id exclusion), with a profiles join added for activity.

CREATE OR REPLACE FUNCTION public.get_rep_portal_activity()
 RETURNS TABLE(rep_id uuid, rep_name text, email text, last_signed_in_at timestamp with time zone, last_activity_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    min(sr.id::text)::uuid AS rep_id,
    string_agg(DISTINCT sr.name, ' / ' ORDER BY sr.name) AS rep_name,
    min(au.email) AS email,
    max(sil.signed_in_at) FILTER (WHERE sil.admin_actor_user_id IS NULL) AS last_signed_in_at,
    max(p.last_activity_at) AS last_activity_at
  FROM public.sales_reps sr
  JOIN public.user_reps ur ON ur.rep_id = sr.id
  LEFT JOIN auth.users au ON au.id = ur.user_id
  LEFT JOIN public.sign_in_log sil ON sil.user_id = ur.user_id
  LEFT JOIN public.profiles p ON p.user_id = ur.user_id
  WHERE
    (
      public.is_admin()
      OR (public.has_role(auth.uid(), 'manager') AND lower(auth.email()) <> 'kate@lineage-collections.com')
      OR sr.id IN (SELECT public.current_manager_rep_ids())
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles uro
      WHERE uro.user_id = ur.user_id AND uro.role IN ('admin', 'manager')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_managers um WHERE um.user_id = ur.user_id
    )
  GROUP BY ur.user_id

  UNION ALL

  SELECT
    sr.id AS rep_id,
    sr.name AS rep_name,
    au.email AS email,
    max(sil.signed_in_at) FILTER (WHERE sil.admin_actor_user_id IS NULL) AS last_signed_in_at,
    max(p.last_activity_at) AS last_activity_at
  FROM public.sales_reps sr
  JOIN auth.users au ON lower(au.email) = 'kate@lineage-collections.com'
  LEFT JOIN public.sign_in_log sil ON sil.user_id = au.id
  LEFT JOIN public.profiles p ON p.user_id = au.id
  WHERE sr.id = '75eb2c49-31b0-4071-9232-0156b4459c3f'
    AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'))
    AND lower(auth.email()) <> 'kate@lineage-collections.com'
  GROUP BY sr.id, sr.name, au.email;
$function$;

GRANT EXECUTE ON FUNCTION public.get_rep_portal_activity() TO authenticated;

COMMIT;
