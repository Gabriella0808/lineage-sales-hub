-- ══════════════════════════════════════════════════════════════════════════════
-- v_prospect_reporting_overview will be queried directly by the client
-- (supabase.from('v_prospect_reporting_overview')...), same pattern as
-- useCrmAccounts() querying crm_accounts directly. Without security_invoker,
-- Postgres views run with the VIEW OWNER's privileges by default, which
-- would bypass crm_accounts' RLS ("admin OR manager only") for anyone who
-- can query the view - including a "rep" role, who has zero prospect
-- access anywhere else in this app. Confirmed via pg_class.reloptions that
-- the view created in the prior migration does NOT have security_invoker
-- set (defaults to false).
--
-- This project's tables (crm_accounts included) grant broad table-level
-- privileges to both anon and authenticated, with RLS as the actual
-- enforcement boundary (has_role(auth.uid(), ...)) - not GRANTs. Setting
-- security_invoker = true makes the view re-evaluate RLS as the querying
-- user against crm_accounts/crm_account_notes/dealer_check_ins/dealers/
-- crm_account_events, matching that same real enforcement boundary,
-- instead of silently bypassing it.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER VIEW public.v_prospect_reporting_overview SET (security_invoker = true);

GRANT SELECT ON public.v_prospect_reporting_overview TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- 1. security_invoker is now set:
--    SELECT reloptions FROM pg_class WHERE relname = 'v_prospect_reporting_overview';
--    -- expect {security_invoker=true}
--
-- 2. RLS is actually enforced through the view (not bypassed) - run inside
--    a transaction, switching role with no auth.uid() context, which
--    should evaluate has_role(NULL, ...) = false on crm_accounts and
--    therefore return 0 rows even though authenticated has a broad SELECT
--    grant:
--    BEGIN;
--      SET LOCAL role authenticated;
--      SELECT count(*) FROM v_prospect_reporting_overview;
--      -- expect 0 (no admin/manager role resolvable for this session)
--    ROLLBACK;
-- ══════════════════════════════════════════════════════════════════════════════
