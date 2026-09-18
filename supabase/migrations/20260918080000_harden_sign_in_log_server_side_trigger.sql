-- Harden sign_in_log accuracy: it was previously written to only from the
-- client (AuthContext.tsx, on the SIGNED_IN auth event). That's unreliable
-- for two reasons:
--   1. It can silently miss logins (network blip, ad blocker, tab closed
--      before the insert lands, RLS misconfiguration, etc).
--   2. It over-counts: supabase-js fires SIGNED_IN not just on a real
--      login, but also on local session restoration from storage (page
--      reload, tab refocus, token refresh) -- none of which are a new
--      login, yet each one was writing a fresh row.
--
-- Fix: log logins server-side instead, from auth.users.last_sign_in_at,
-- which GoTrue (Supabase Auth) updates itself only on an actual sign-in
-- call (password/OTP/OAuth/magic-link) -- never on session restoration or
-- token refresh. A trigger on that column change is the same pattern
-- Supabase's own docs use for "notify on login" style triggers, and this
-- project already has trigger rights on auth.users (see on_auth_user_created
-- in 20260416220510_...sql).
--
-- The old client-side insert in AuthContext.tsx is being removed in the
-- same change so sign_in_log has exactly one write path going forward.

CREATE OR REPLACE FUNCTION public.log_sign_in()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.sign_in_log (user_id, signed_in_at)
  VALUES (NEW.id, NEW.last_sign_in_at);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_sign_in
  AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.last_sign_in_at IS DISTINCT FROM NEW.last_sign_in_at)
  EXECUTE FUNCTION public.log_sign_in();
