-- Fix stale rep_id values in rep_targets.
--
-- When sales_reps rows are deleted and re-created (new UUIDs), rep_targets rows
-- that reference the old UUIDs become orphaned: rep_id NOT IN (sales_reps.id).
-- The Sales Targets UI shows reps from the current sales_reps table and saves
-- new targets under the current UUIDs, but previously saved rows are left behind
-- with stale IDs.
--
-- This migration deletes those orphaned rows so the table only contains rows whose
-- rep_id references a current sales_rep. After running, re-save each rep's targets
-- in the Sales Targets section of the portal (or use Copy from previous year) to
-- rebuild with current UUIDs.

DELETE FROM public.rep_targets
WHERE rep_id NOT IN (SELECT id FROM public.sales_reps);
