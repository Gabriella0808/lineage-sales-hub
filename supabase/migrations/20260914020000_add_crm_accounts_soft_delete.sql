-- ══════════════════════════════════════════════════════════════════════════════
-- Soft delete for crm_accounts (Prospects list).
--
-- Why: deleting a prospect from the Prospects list currently tries to hard-
-- delete its linked `dealers` row (for "prospect-shell" dealers created the
-- first time a check-in is logged, dealers.id === crm_accounts.id). But
-- dealer_check_ins.dealer_id -> dealers.id is ON DELETE RESTRICT, so
-- deleting a prospect that has any check-in history currently fails outright
-- with a foreign key violation - nothing actually gets deleted.
--
-- Fix: deletion becomes a flag flip instead of a real delete. Nothing in
-- dealers or dealer_check_ins is ever touched, so:
--   - delete can never hit the FK restriction again
--   - "revert" is just clearing the flag - full fidelity guaranteed, since
--     the underlying data (check-ins, dealer link, notes, etc.) was never
--     removed in the first place
--
-- NULL = active/visible (the default, existing behavior for every row).
-- A timestamp = deleted at that time, and hidden from the normal Prospects
-- list and the Field Check-Ins map until restored.
--
-- No other tables/columns changed. No existing rows affected (new column
-- defaults to NULL for everyone).
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.crm_accounts
  ADD COLUMN deleted_at timestamptz NULL;
