-- Resolve sales rep notification emails from Team Access (auth.users via
-- user_reps), not the hand-maintained sales_reps.email column.
--
-- Root cause (confirmed by live-data audit): acctivate_sales_reps.email is
-- never populated - Acctivate doesn't sync rep email at all - so the
-- Capture Leads rep picker and its "new lead assigned" notification have
-- always depended on public.sales_reps.email, a manually-typed column that
-- has drifted out of sync for several active reps (10 of 27 active rows had
-- a null email; others only had a generic shared alias). Meanwhile
-- public.user_reps already links a sales_reps row to the real Team Access
-- account (auth.users) that owns it - that's the actual source of truth for
-- a rep's real email, already used the same way by get_rep_portal_activity().
--
-- get_sales_rep_emails() returns, per active rep, the email(s) of every
-- Team Access account linked via user_reps (comma-joined when more than one
-- person is linked - process-email-queue already treats a comma-separated
-- `to` as multiple recipients, the same convention already used for "Doug
-- Brown and Gavin Dietz"), falling back to the sales_reps.email column only
-- when no Team Access account is linked at all. Restricted to admin/manager
-- callers to match the existing "Admins and managers can read sales_reps"
-- RLS policy - this doesn't expose anything a rep couldn't already see via
-- that table today.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_sales_rep_emails()
RETURNS TABLE(rep_id uuid, email text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    sr.id AS rep_id,
    COALESCE(
      (SELECT string_agg(DISTINCT au.email, ', ' ORDER BY au.email)
       FROM public.user_reps ur
       JOIN auth.users au ON au.id = ur.user_id
       WHERE ur.rep_id = sr.id),
      sr.email
    ) AS email
  FROM public.sales_reps sr
  WHERE sr.status = 'active'
    AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'));
$function$;

GRANT EXECUTE ON FUNCTION public.get_sales_rep_emails() TO authenticated;

-- Data cleanup: public.user_reps has no uniqueness constraint on rep_id, so
-- stray double-links are possible. The Team Access account correctly linked
-- to "Illinois, Wisconsin, Minnesota and Dakotas" (id
-- 04b58e62-7a58-4e7b-810b-0cd85b7f3618) was also accidentally linked to the
-- separate "Missouri, Kansas, Iowa, Nebraska" rep row (id
-- 2a2e3de1-d1e2-4a7b-8f6c-bf751c72c615), which already has its own correct
-- owner linked too. Remove only that stray second link on the Missouri/
-- Kansas/Iowa/Nebraska row - the real link on the Illinois/Wisconsin row is
-- untouched.
DELETE FROM public.user_reps
WHERE rep_id = '2a2e3de1-d1e2-4a7b-8f6c-bf751c72c615'
  AND user_id IN (
    SELECT user_id FROM public.user_reps WHERE rep_id = '04b58e62-7a58-4e7b-810b-0cd85b7f3618'
  );

-- Backfill the sales_reps.email column itself too (kept as the fallback the
-- function above reads when a rep has no Team Access link yet, and for any
-- other existing reader of this column), deriving each value from the
-- Team Access account now correctly linked to that rep rather than typing
-- the address in literally.
UPDATE public.sales_reps sr
SET email = (
  SELECT au.email FROM public.user_reps ur JOIN auth.users au ON au.id = ur.user_id
  WHERE ur.rep_id = sr.id
)
WHERE sr.id IN (
  '04b58e62-7a58-4e7b-810b-0cd85b7f3618', -- Illinois, Wisconsin, Minnesota and Dakotas
  '2a2e3de1-d1e2-4a7b-8f6c-bf751c72c615'  -- Missouri, Kansas, Iowa, Nebraska
)
AND (SELECT count(*) FROM public.user_reps ur WHERE ur.rep_id = sr.id) = 1; -- only when unambiguous

COMMIT;
