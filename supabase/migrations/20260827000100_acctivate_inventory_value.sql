-- ══════════════════════════════════════════════════════════════════════════════
-- acctivate_inventory_value
-- Canonical source for total inventory value, synced directly from Acctivate.
-- Source: dbo.ProductWarehouseSummary JOIN dbo.Product WHERE product is Active.
-- One row per (product_id, warehouse).
-- Populated by: C:\AcctivateKPI\sync-total-inventory-value.ps1 (daily 5:20 AM).
--
-- Key design decisions:
--   • active = TRUE  includes BOTH active-non-discontinued AND active-discontinued.
--     Total Inventory Value = SUM(on_hand_value) WHERE active = TRUE  (~$1.834M).
--   • discontinued = TRUE is a sub-flag. Those products are still Active in
--     Acctivate and ARE included in the total.
--     Discontinued Inventory = SUM(on_hand_value) WHERE active AND discontinued (~$403K).
--   • on_hand_value is Acctivate's own OnHandValue field (average-cost × qty),
--     not re-computed from Available × UnitCost in the frontend.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.acctivate_inventory_value (
  product_id    TEXT        NOT NULL,
  warehouse     TEXT        NOT NULL DEFAULT 'Warehouse',
  description   TEXT,
  collection    TEXT,
  on_hand       NUMERIC     NOT NULL DEFAULT 0,
  available     NUMERIC     NOT NULL DEFAULT 0,
  on_hand_value NUMERIC     NOT NULL DEFAULT 0,
  list_price    NUMERIC,
  active        BOOLEAN     NOT NULL DEFAULT TRUE,
  discontinued  BOOLEAN     NOT NULL DEFAULT FALSE,
  avail_on_web  BOOLEAN,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, warehouse)
);

CREATE INDEX IF NOT EXISTS idx_acctivate_inv_value_active
  ON public.acctivate_inventory_value (active);

CREATE INDEX IF NOT EXISTS idx_acctivate_inv_value_discontinued
  ON public.acctivate_inventory_value (active, discontinued);

ALTER TABLE public.acctivate_inventory_value ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'acctivate_inventory_value'
      AND policyname = 'Authenticated read acctivate_inventory_value'
  ) THEN
    CREATE POLICY "Authenticated read acctivate_inventory_value"
      ON public.acctivate_inventory_value
      FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;

-- ── v_portal_inventory_summary ──────────────────────────────────────────────
-- Replaces any prior version (Skyvia FDW, manually created, or old migration).
-- Exposes all Active rows with inventory_value = Acctivate OnHandValue directly.
-- Frontend aggregations:
--   Total Inventory Value = SUM(inventory_value)            (~$1.834M)
--   Discontinued subset   = SUM(inventory_value) WHERE discontinued  (~$403K)

DROP VIEW IF EXISTS public.v_portal_inventory_summary;

CREATE VIEW public.v_portal_inventory_summary
WITH (security_invoker = true) AS
SELECT
  (product_id || '::' || warehouse)  AS guid_product_warehouse,
  product_id                         AS sku,
  description                        AS product,
  warehouse,
  collection,
  on_hand,
  available,
  on_hand_value                      AS inventory_value,
  CASE WHEN on_hand > 0
       THEN ROUND(on_hand_value / on_hand, 4)
       ELSE NULL
  END                                AS unit_cost,
  active,
  discontinued
FROM public.acctivate_inventory_value
WHERE active = TRUE;

GRANT SELECT ON public.v_portal_inventory_summary TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
