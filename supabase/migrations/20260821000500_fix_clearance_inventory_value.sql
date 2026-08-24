-- Wire on_hand_value from stg_acctivate_discontinued_inventory into inventory_value
-- on both clearance/closeout views.
--
-- Root cause: both views were created with NULL::numeric AS inventory_value.
-- The sync script now populates on_hand_value (from Acctivate OnHandValue), but
-- the views never read it, so the portal always showed $0 Inventory Value.
--
-- Validation (run after applying + rerunning sync):
--   SELECT
--     COUNT(*)                                                AS rows,
--     ROUND(SUM(NULLIF(on_hand_value,'')::numeric), 0)       AS total_inventory_value
--   FROM public.stg_acctivate_discontinued_inventory
--   WHERE NULLIF(on_hand_value,'') IS NOT NULL;

-- Drop in dependency order: closeout depends on clearance, so closeout first
DROP VIEW IF EXISTS public.v_portal_closeout_inventory;
DROP VIEW IF EXISTS public.v_portal_clearance_products;

CREATE VIEW public.v_portal_clearance_products
WITH (security_invoker = true) AS
SELECT
  gen_random_uuid()                                             AS id,
  s.product_id                                                  AS sku,
  s.description                                                 AS product,
  s.warehouse,
  s.product_class                                               AS collection,
  s.available::numeric                                          AS available,
  s.on_hand::numeric                                            AS on_hand,
  s.list_price::numeric                                         AS list_price,
  CASE WHEN s.list_price::numeric > 0
       THEN s.list_price::numeric * s.available::numeric
       ELSE NULL
  END                                                           AS retail_value,
  NULLIF(s.on_hand_value, '')::numeric                          AS inventory_value,
  s.active_product                                              AS status,
  CASE WHEN s.list_price::numeric > 0
       THEN 'Standard' ELSE 'Missing SD'
  END                                                           AS retail_value_price_source
FROM public.stg_acctivate_discontinued_inventory s
WHERE s.discontinued IN ('true','1','True')
  AND s.on_hand::numeric > 0;

GRANT SELECT ON public.v_portal_clearance_products TO authenticated, anon, service_role;

CREATE VIEW public.v_portal_closeout_inventory
WITH (security_invoker = true) AS
SELECT
  s.guid_product_warehouse,
  s.product_id                                                  AS sku,
  s.description                                                 AS product,
  s.warehouse,
  s.product_class                                               AS collection,
  s.on_hand::numeric                                            AS on_hand,
  s.available::numeric                                          AS available,
  NULL::numeric                                                 AS unit_cost,
  NULLIF(s.on_hand_value, '')::numeric                          AS inventory_value,
  s.discontinued IN ('true','1','True')                         AS discontinued,
  s.active_product IN ('true','1','True','active')              AS active_product,
  s.avail_on_web IN ('true','1','True')                         AS avail_on_web,
  false                                                         AS is_closeout
FROM public.stg_acctivate_discontinued_inventory s;

GRANT SELECT ON public.v_portal_closeout_inventory TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
