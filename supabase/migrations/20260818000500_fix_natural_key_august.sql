-- Clear August rows uploaded with the incomplete 4-part natural_key formula and
-- add the three columns the updated sync script populates.
--
-- After this migration, run sync-aug-current-invoiced-lines.ps1 on the VM.
-- The script will re-upload all August rows using the correct 8-part natural_key:
--   invoice_number + line_number + sub_line_number + component_level
--   + product_id + order_number + guid_invoice_detail + duplicate_row_ordinal
--
-- Jan-Jul rows are untouched (invoice_date < 2026-08-01).

-- Delete stale August rows so the re-sync does not collide with old keys
DELETE FROM public.acctivate_invoice_lines_2026_direct
WHERE invoice_date >= '2026-08-01';

-- Add columns populated by the updated sync script
ALTER TABLE public.acctivate_invoice_lines_2026_direct
  ADD COLUMN IF NOT EXISTS sub_line_number       text,
  ADD COLUMN IF NOT EXISTS component_level       text,
  ADD COLUMN IF NOT EXISTS duplicate_row_ordinal integer;

-- Refresh the materialized view so the portal shows Jan-Jul only until re-sync
REFRESH MATERIALIZED VIEW public.mv_portal_monthly_invoiced_actuals;
