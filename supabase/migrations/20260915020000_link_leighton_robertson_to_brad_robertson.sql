-- ══════════════════════════════════════════════════════════════════════════════
-- Leighton Robertson (leightonrobertson@gmail.com) and Brad Robertson work
-- as one sales team. Leighton is currently linked (via user_reps) only to
-- a placeholder sales_reps row named "Robertson" with no Acctivate code -
-- current_rep_acctivate_ids() ignores rows with no code, so Leighton's
-- login currently resolves to zero scope everywhere (Dealer/Rep Reporting,
-- Open SO). Brad's real rep record (acctivate_id 'BradR') is the one that
-- actually carries transaction data.
--
-- Fix: add a second user_reps link for Leighton's login pointing directly
-- at Brad's real sales_reps row - the same multi-record-per-login pattern
-- already used for multi-territory reps (e.g. Jordan Shindell has two
-- user_reps rows). No RPC/schema changes needed: current_rep_ids() and
-- current_rep_acctivate_ids() already combine every rep record a login is
-- linked to, so Leighton will now be scoped to exactly what Brad sees.
--
-- One-directional by design: Leighton's existing placeholder rep record
-- has no code of its own, so there is nothing of his for this link to
-- expose back to Brad. That existing placeholder link is left in place
-- (it contributes nothing, so it's harmless) - only rep_id/manager_id/
-- territory ownership data, no dealer roster or transaction data touched.
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.user_reps (user_id, rep_id)
VALUES ('6ab4d5da-ccfe-4052-a26b-d3c1841af5fe', '7a98ca2c-c6aa-4541-b680-cbc5485f3cc3')
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- BEGIN;
-- SELECT set_config('request.jwt.claims', json_build_object('sub','6ab4d5da-ccfe-4052-a26b-d3c1841af5fe','role','authenticated')::text, true);
-- SET LOCAL ROLE authenticated;
-- SELECT current_rep_acctivate_ids();
-- -- expect: {bradr}
-- ROLLBACK;
-- ══════════════════════════════════════════════════════════════════════════════
