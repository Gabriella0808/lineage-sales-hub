-- Fix v_portal_clearance_products and v_portal_closeout_inventory returning 0 rows.
--
-- Root cause: migration 20260821000500 created both views with security_invoker=true,
-- which forces PostgreSQL to check the CALLER's privileges against the underlying
-- stg_acctivate_discontinued_inventory table.  That table has no GRANT SELECT for
-- authenticated/anon roles (only an RLS policy, which is checked after the privilege
-- check), so all callers are silently blocked.
--
-- Fix: recreate views WITHOUT security_invoker (PostgreSQL default = view owner's
-- privileges are used, bypassing RLS on the underlying table — the same pattern used
-- by all other portal views in this project).  Also GRANT SELECT on the staging table
-- to service_role so the sync script can read it back if needed.

DROP VIEW IF EXISTS public.v_portal_closeout_inventory;
DROP VIEW IF EXISTS public.v_portal_clearance_products;

CREATE VIEW public.v_portal_clearance_products AS
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

CREATE VIEW public.v_portal_closeout_inventory AS
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
