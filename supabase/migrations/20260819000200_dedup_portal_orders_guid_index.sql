-- Dedup portal_acctivate_orders and add unique index on guid_order so that
-- PostgREST can resolve on_conflict=guid_order in the direct bookings sync script.
--
-- Keeps one row per guid_order value (lowest ctid = earliest physical row).
-- Rows with guid_order IS NULL are kept as-is (PostgreSQL unique indexes treat
-- each NULL as distinct, so they do not violate uniqueness).

BEGIN;

-- 1. Remove duplicate guid_order rows, keeping the earliest physical row.
WITH ranked AS (
    SELECT ctid,
           ROW_NUMBER() OVER (
               PARTITION BY guid_order
               ORDER BY ctid
           ) AS rn
    FROM public.portal_acctivate_orders
)
DELETE FROM public.portal_acctivate_orders
WHERE ctid IN (SELECT ctid FROM ranked WHERE rn > 1);

-- 2. Create the unique index required for on_conflict=guid_order upserts.
CREATE UNIQUE INDEX IF NOT EXISTS portal_acctivate_orders_guid_order_uidx
  ON public.portal_acctivate_orders (guid_order);

COMMIT;
