-- Phase 1 setup for direct VM bookings sync (Aug 1, 2026 onwards).
-- Purges Skyvia-synced August rows so the direct pull starts clean,
-- then adds the deduplication columns needed by sync-aug-current-bookings.ps1.
--
-- NOTE: Assumes portal_acctivate_orders has columns named guid_order (text)
-- and order_date (date). If those names differ, update the DELETEs before applying.
-- Also assumes portal_acctivate_order_lines.guid_order references the same values
-- as portal_acctivate_orders.guid_order (text, no braces, lowercase).

BEGIN;

-- 1. Remove Skyvia-synced August order lines first (must precede orders delete).
DELETE FROM public.portal_acctivate_order_lines ol
USING public.portal_acctivate_orders o
WHERE ol.guid_order::text = o.guid_order::text
  AND o.order_date >= '2026-08-01';

-- 2. Remove Skyvia-synced August orders.
DELETE FROM public.portal_acctivate_orders
WHERE order_date >= '2026-08-01';

-- 3. Ensure guid_order has a unique index on the orders table so PostgREST
--    can use on_conflict=guid_order for upsert. Multiple NULLs are allowed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_orders_guid_order
  ON public.portal_acctivate_orders (guid_order);

-- 4. Add columns needed by the direct bookings sync script.
--    Pre-August Skyvia rows keep natural_key = NULL (treated as distinct by PG,
--    so no uniqueness violation for those rows).
ALTER TABLE public.portal_acctivate_order_lines
  ADD COLUMN IF NOT EXISTS source_guid_order_detail  text,
  ADD COLUMN IF NOT EXISTS line_number               text,
  ADD COLUMN IF NOT EXISTS sub_line_number           text,
  ADD COLUMN IF NOT EXISTS component_level           text,
  ADD COLUMN IF NOT EXISTS duplicate_row_ordinal     integer,
  ADD COLUMN IF NOT EXISTS natural_key               text,
  ADD COLUMN IF NOT EXISTS source                    text,
  ADD COLUMN IF NOT EXISTS order_date                date;

-- 5. Unique index on natural_key for upsert conflict resolution.
--    PostgreSQL treats NULLs as distinct, so pre-August rows are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_order_lines_natural_key
  ON public.portal_acctivate_order_lines (natural_key);

COMMIT;
