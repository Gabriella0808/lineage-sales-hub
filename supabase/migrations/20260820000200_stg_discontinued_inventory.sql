-- Staging table for discontinued / clearance / closeout product inventory.
-- Populated by the VM PowerShell script:
--   C:\AcctivateKPI\sync-discontinued-products.ps1
-- which replaces the Skyvia sync for this data set.
--
-- One row per (product_id, warehouse).  Script upserts on that composite key:
--   POST /rest/v1/stg_acctivate_discontinued_inventory?on_conflict=product_id,warehouse
--
-- The two inventory portal views read from this table:
--   v_portal_clearance_products
--   v_portal_closeout_inventory
-- (v_portal_clearance_sales_analytics reads invoice lines — not touched here)
--
-- ── Schema note ────────────────────────────────────────────────────────────────
-- This table was pre-created by Skyvia.  CREATE TABLE IF NOT EXISTS is a no-op
-- when the table already exists; the DO blocks below apply the unique constraint
-- and RLS policy safely on a pre-existing table.
--
-- Confirm actual column names before updating views:
--   SELECT column_name, data_type
--   FROM   information_schema.columns
--   WHERE  table_schema = 'public'
--     AND  table_name   = 'stg_acctivate_discontinued_inventory'
--   ORDER  BY ordinal_position;
--
-- ── Update the two inventory portal views after the first successful sync ──────
--
--   CREATE OR REPLACE VIEW public.v_portal_clearance_products
--   WITH (security_invoker = true) AS
--   SELECT
--     gen_random_uuid()                                      AS id,
--     s.product_id                                           AS sku,
--     s.description                                          AS product,
--     s.warehouse,
--     s.product_class                                        AS collection,
--     s.available::numeric                                   AS available,
--     s.on_hand::numeric                                     AS on_hand,
--     s.list_price::numeric                                  AS list_price,
--     CASE WHEN s.list_price::numeric > 0
--          THEN s.list_price::numeric * s.available::numeric
--          ELSE NULL END                                     AS retail_value,
--     NULL::numeric                                          AS inventory_value,
--     s.active_product                                       AS status,
--     CASE WHEN s.list_price::numeric > 0
--          THEN 'Standard' ELSE 'Missing SD' END            AS retail_value_price_source
--   FROM public.stg_acctivate_discontinued_inventory s
--   WHERE s.discontinued IN ('true','1','True')
--     AND s.on_hand::numeric > 0;
--
--   CREATE OR REPLACE VIEW public.v_portal_closeout_inventory
--   WITH (security_invoker = true) AS
--   SELECT
--     s.guid_product_warehouse,
--     s.product_id                                           AS sku,
--     s.description                                          AS product,
--     s.warehouse,
--     s.product_class                                        AS collection,
--     s.on_hand::numeric                                     AS on_hand,
--     s.available::numeric                                   AS available,
--     NULL::numeric                                          AS unit_cost,
--     NULL::numeric                                          AS inventory_value,
--     s.discontinued IN ('true','1','True')                  AS discontinued,
--     s.active_product IN ('true','1','True','active')       AS active_product,
--     s.avail_on_web IN ('true','1','True')                  AS avail_on_web,
--     false                                                  AS is_closeout
--   FROM public.stg_acctivate_discontinued_inventory s;
--
-- ── Validation queries (run after first sync) ──────────────────────────────────
--
--   -- Row count and last sync time:
--   SELECT COUNT(*) AS total_rows, MAX(synced_at) AS last_sync
--   FROM public.stg_acctivate_discontinued_inventory;
--
--   -- Totals by discontinued flag:
--   SELECT discontinued,
--          COUNT(*)               AS rows,
--          SUM(available::numeric) AS total_available,
--          SUM(on_hand::numeric)   AS total_on_hand
--   FROM public.stg_acctivate_discontinued_inventory
--   GROUP BY discontinued
--   ORDER BY discontinued;
--
--   -- Spot-check:
--   SELECT product_id, description, warehouse, on_hand, available,
--          list_price, product_class, discontinued, active_product,
--          avail_on_web, synced_at
--   FROM public.stg_acctivate_discontinued_inventory
--   ORDER BY product_id, warehouse
--   LIMIT 25;
-- ──────────────────────────────────────────────────────────────────────────────

-- Full schema matching what Skyvia created.
-- Columns are stored as text (Skyvia default for most fields).
CREATE TABLE IF NOT EXISTS public.stg_acctivate_discontinued_inventory (
  guid_product_warehouse  text,
  guid_product            text,
  product_id              text        NOT NULL,
  description             text,
  warehouse               text        NOT NULL DEFAULT 'Warehouse',
  stock_unit              text,
  list_price              text,
  list_price_unit         text,
  list_price_type         text,
  item_type               text,
  on_hand_value           text,
  on_hand                 text,
  available               text,
  product_class           text,
  discontinued            text,
  active_product          text,
  avail_on_web            text,
  synced_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, warehouse)
);

-- Add the unique constraint on the pre-existing Skyvia table if missing.
-- PostgREST requires it for on_conflict=product_id,warehouse to work.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint c
    JOIN   pg_class      r ON r.oid = c.conrelid
    JOIN   pg_namespace  n ON n.oid = r.relnamespace
    WHERE  n.nspname = 'public'
      AND  r.relname = 'stg_acctivate_discontinued_inventory'
      AND  c.contype = 'u'
      AND  c.conname = 'stg_disc_inv_product_id_warehouse_key'
  ) THEN
    ALTER TABLE public.stg_acctivate_discontinued_inventory
      ADD CONSTRAINT stg_disc_inv_product_id_warehouse_key
      UNIQUE (product_id, warehouse);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stg_disc_inv_product_id
  ON public.stg_acctivate_discontinued_inventory (product_id);
CREATE INDEX IF NOT EXISTS idx_stg_disc_inv_discontinued
  ON public.stg_acctivate_discontinued_inventory (discontinued);

ALTER TABLE public.stg_acctivate_discontinued_inventory ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'stg_acctivate_discontinued_inventory'
      AND policyname = 'Authenticated read stg_acctivate_discontinued_inventory'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Authenticated read stg_acctivate_discontinued_inventory"
        ON public.stg_acctivate_discontinued_inventory
        FOR SELECT TO authenticated USING (true)
    $p$;
  END IF;
END $$;
