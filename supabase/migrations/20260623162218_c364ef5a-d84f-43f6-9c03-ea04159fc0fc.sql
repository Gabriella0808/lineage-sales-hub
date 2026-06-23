CREATE OR REPLACE VIEW public.inventory_live_onhand
WITH (security_invoker = true)
AS
SELECT
  p."ProductID" AS sku,
  SUM(s."QtyOnHand")::numeric AS on_hand,
  SUM(CAST(s."OnHandValue" AS numeric))::numeric AS on_hand_value,
  MAX(s._skyvia_sync) AS last_synced_at
FROM public."dbo_InventoryOnHandByLocationSummary" s
JOIN public."dbo_Product" p ON p."GUIDProduct" = s."GUIDProduct"
WHERE p."ProductID" IS NOT NULL
GROUP BY p."ProductID";

GRANT SELECT ON public.inventory_live_onhand TO authenticated, anon, service_role;