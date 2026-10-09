-- Adds Customer PO Number support to Open Sales Orders reporting.
--
-- Acctivate source confirmed live (not guessed) against three known orders
-- via a diagnostic SSMS query run directly against dbo.Orders:
--   0181740 -> PO = "73469 Freight"  (matches the value given for this task)
--   0179723 -> PO = "C44070698"
--   0181414 -> PO = "C34092297"
-- Reference/Reference2 were checked and ruled out (different values,
-- "THV585-DS" style codes, not Customer PO Number).
--
-- public.portal_acctivate_orders already has an unused "po" column (not
-- populated by any currently-running sync - sync-aug-current-bookings.ps1
-- explicitly documents it as "NOT sent" - its existing values are stale
-- leftovers from a retired sync, not referenced by any view or the portal
-- UI). Deliberately NOT reusing it - see sync-open-sales-orders.ps1's own
-- comment for why. Left untouched here, to be cleaned up later once
-- customer_po_number is stable.
ALTER TABLE public.portal_acctivate_orders
  ADD COLUMN IF NOT EXISTS customer_po_number text;

COMMENT ON COLUMN public.portal_acctivate_orders.customer_po_number IS
  'Customer PO Number from Acctivate dbo.Orders.PO (Sales Order > Reference tab). Populated by sync-open-sales-orders.ps1. Nullable - not every order has one. Do not confuse with the unused legacy "po" column on this same table.';

-- Expose it on v_portal_open_sales_order_line_facts. Open SO reporting is
-- line-based, so the header-level value is carried onto every line of its
-- order (same pattern this view already uses for order_number, order_date,
-- dealer_name, etc. - all header fields repeated per line).
CREATE OR REPLACE VIEW public.v_portal_open_sales_order_line_facts AS
WITH real_reps AS (
  SELECT sr.id AS portal_rep_id,
    sr.name AS canonical_rep_name,
    sr.acctivate_id AS canonical_rep_key,
    sr.manager_id
  FROM sales_reps sr
  WHERE NULLIF(TRIM(BOTH FROM sr.acctivate_id), ''::text) IS NOT NULL AND NOT (EXISTS ( SELECT 1
    FROM territories t
    WHERE lower(TRIM(BOTH FROM t.name)) = lower(TRIM(BOTH FROM sr.name))))
), order_salesperson_lookup AS (
  SELECT TRIM(BOTH '{}'::text FROM lower(o."GUIDSalesperson"::text)) AS guid_salesperson_norm,
    max(NULLIF(TRIM(BOTH FROM o."SalespersonID"::text), ''::text)) AS salesperson_id,
    max(NULLIF(TRIM(BOTH FROM o."SalespersonName"::text), ''::text)) AS salesperson_name
  FROM "dbo_Orders" o
  WHERE o."GUIDSalesperson" IS NOT NULL
  GROUP BY (TRIM(BOTH '{}'::text FROM lower(o."GUIDSalesperson"::text)))
), lines AS (
  SELECT o.guid_order AS raw_guid_order,
    o.order_number,
    o.order_date::date AS order_date,
    o.requested_ship_date::date AS requested_ship_date,
    o.workflow_status,
    o.customer_id,
    dl.name AS dealer_lookup_name,
    COALESCE(NULLIF(osl.salesperson_id, ''::text), NULLIF(TRIM(BOTH FROM o.rep1), ''::text), NULLIF(TRIM(BOTH FROM o.rep2), ''::text), ''::text) AS rep_id,
    COALESCE(NULLIF(osl.salesperson_name, ''::text), NULLIF(TRIM(BOTH FROM asr.name), ''::text), NULLIF(TRIM(BOTH FROM o.rep1), ''::text), NULLIF(TRIM(BOTH FROM o.rep2), ''::text), 'Unassigned'::text) AS rep_name,
    o.branch_id,
    CASE upper(COALESCE(o.branch_id, ''::text))
      WHEN 'MIXED'::text THEN 'container'::text
      WHEN 'DIRECT'::text THEN 'container'::text
      WHEN 'WHSALES'::text THEN 'warehouse'::text
      ELSE 'unclassified'::text
    END AS fulfillment_type,
    NULL::text AS warehouse,
    ol.product_id AS sku,
    ol.description,
    ol.product_class,
    ol.sales_category,
    CASE
      WHEN ol.sales_category = 'SW'::text THEN 'Sea Winds'::text
      WHEN ol.sales_category = ANY (ARRAY['FL'::text, 'FINNLOU'::text]) THEN 'Finn & Lou'::text
      WHEN upper(COALESCE(ol.sales_category, ''::text)) = 'LUX'::text THEN 'Lux'::text
      WHEN ol.sales_category = 'ALLOW'::text OR COALESCE(ol.sales_category, ''::text) = ''::text THEN 'ALLOW'::text
      ELSE NULL::text
    END AS brand_category,
    COALESCE(NULLIF(TRIM(BOTH FROM ol.qty_ordered), ''::text)::numeric, 0::numeric) AS qty_ordered,
    COALESCE(NULLIF(TRIM(BOTH FROM ol.qty_shipped), ''::text)::numeric, 0::numeric) AS qty_shipped,
    ol.qty_outstanding,
    ol.price,
    COALESCE(NULLIF(TRIM(BOTH FROM ol.line_discount_pct), ''::text)::numeric, 0::numeric) AS line_discount_pct,
    rr.manager_id,
    o.customer_po_number
  FROM portal_acctivate_orders o
    JOIN portal_acctivate_order_lines ol ON ol.guid_order = o.guid_order
    LEFT JOIN dealers dl ON dl.acctivate_id = o.customer_id
    LEFT JOIN order_salesperson_lookup osl ON osl.guid_salesperson_norm = TRIM(BOTH '{}'::text FROM lower(o.guid_salesperson))
    LEFT JOIN acctivate_sales_reps asr ON lower(TRIM(BOTH FROM asr.acctivate_id)) = lower(TRIM(BOTH FROM COALESCE(NULLIF(osl.salesperson_id, ''::text), NULLIF(TRIM(BOTH FROM o.rep1), ''::text), NULLIF(TRIM(BOTH FROM o.rep2), ''::text))))
    LEFT JOIN real_reps rr ON lower(TRIM(BOTH FROM rr.canonical_rep_key)) = lower(TRIM(BOTH FROM COALESCE(NULLIF(osl.salesperson_id, ''::text), NULLIF(TRIM(BOTH FROM o.rep1), ''::text), NULLIF(TRIM(BOTH FROM o.rep2), ''::text))))
  WHERE (o.workflow_status = ANY (ARRAY['Not Ready to Pick'::text, 'Ready to Pick'::text, 'Pick In Progress'::text, 'Partially Invoiced'::text])) AND (ol.line_cancelled = false OR ol.line_cancelled IS NULL) AND ol.product_id IS NOT NULL AND TRIM(BOTH FROM ol.product_id) <> ''::text AND ol.qty_outstanding > 0::numeric AND (NULLIF(TRIM(BOTH FROM ol.sales_category), ''::text) IS NULL OR (upper(TRIM(BOTH FROM ol.sales_category)) = ANY (ARRAY['ALLOW'::text, 'FINNLOU'::text, 'LUX'::text, 'SW'::text]))) AND ol.product_id !~~* 'Freight Out%'::text
)
SELECT lower(replace(replace(raw_guid_order, '{'::text, ''::text), '}'::text, ''::text)) AS guid_order,
  order_number,
  order_date,
  requested_ship_date,
  customer_id,
  COALESCE(NULLIF(TRIM(BOTH FROM dealer_lookup_name), ''::text), customer_id) AS dealer_name,
  rep_id,
  rep_name,
  sku,
  description,
  product_class,
  sales_category,
  brand_category,
  branch_id,
  fulfillment_type,
  warehouse,
  qty_ordered,
  qty_shipped,
  qty_outstanding AS qty_open,
  price AS unit_price,
  line_discount_pct,
  round(price * qty_outstanding * (1::numeric - COALESCE(line_discount_pct, 0::numeric) / 100.0), 2) AS open_so_amount,
  manager_id,
  workflow_status,
  round(price * qty_outstanding, 2) AS open_so_gross_amount,
  round(price * qty_outstanding * (COALESCE(line_discount_pct, 0::numeric) / 100.0), 2) AS open_so_discount_amount,
  customer_po_number
FROM lines;

-- get_open_sales_order_lines() is what the portal UI actually calls (via
-- InvoiceDetailSheet.tsx's Open Sales Orders drill-down, used from both
-- Dealer and Rep reporting) - it wraps the view above with access-scoping
-- and pagination, and defines its own column list, so adding the column to
-- the view alone isn't enough. Postgres won't let CREATE OR REPLACE change
-- a function's RETURNS TABLE shape, hence the DROP first. Logic below is
-- otherwise byte-for-byte identical to the live function - only
-- customer_po_number was added, to the RETURNS TABLE and the SELECT list.
DROP FUNCTION IF EXISTS public.get_open_sales_order_lines(text, text, text[], text[], text[], text[], uuid, integer, integer);

CREATE FUNCTION public.get_open_sales_order_lines(
  p_group_by text,
  p_entity_key text,
  p_customer_ids text[] DEFAULT NULL::text[],
  p_brand_cats text[] DEFAULT NULL::text[],
  p_skus text[] DEFAULT NULL::text[],
  p_rep_ids text[] DEFAULT NULL::text[],
  p_manager_id uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT 2000,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  guid_order text, order_number text, order_date date, requested_ship_date date,
  customer_id text, dealer_name text, rep_id text, rep_name text,
  fulfillment_type text, warehouse text, sku text, description text, product_class text,
  brand_category text, qty_ordered numeric, qty_shipped numeric, qty_open numeric,
  unit_price numeric, line_discount_pct numeric, net_open_amount numeric,
  customer_po_number text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH effective AS (
    SELECT CASE
      WHEN public.is_admin() OR public.current_manager_id() IS NOT NULL OR public.has_effective_role(auth.uid(), 'manager') THEN p_rep_ids
      WHEN public.current_rep_acctivate_ids() IS NOT NULL THEN public.current_rep_acctivate_ids()
      ELSE ARRAY['__no_rep_mapped__']
    END AS rep_ids
  )
  SELECT
    a.guid_order, a.order_number, a.order_date, a.requested_ship_date,
    a.customer_id, a.dealer_name, a.rep_id, a.rep_name,
    a.fulfillment_type, a.warehouse, a.sku, a.description, a.product_class,
    a.brand_category, a.qty_ordered, a.qty_shipped, a.qty_open,
    a.unit_price, a.line_discount_pct, a.open_so_amount,
    a.customer_po_number
  FROM public.v_portal_open_sales_order_line_facts a, effective
  WHERE
    (
      (p_group_by = 'dealer' AND p_entity_key = 'UNASSIGNED_DEALER'
       AND NOT EXISTS (
         SELECT 1 FROM public.dealers d
         WHERE d.source <> 'field_only'
           AND (NULLIF(TRIM(d.salesperson), '') IS NOT NULL OR NULLIF(TRIM(d.territory), '') IS NOT NULL)
           AND NULLIF(TRIM(d.acctivate_id), '') IS NOT NULL
           AND lower(TRIM(d.acctivate_id)) = lower(TRIM(a.customer_id::text))
       ))
      OR
      (p_group_by = 'dealer' AND p_entity_key <> 'UNASSIGNED_DEALER'
       AND lower(trim(COALESCE(NULLIF(TRIM(a.customer_id::text), ''), 'Unknown'))) = lower(trim(p_entity_key)))
      OR
      (p_group_by = 'rep'
       AND COALESCE(NULLIF(TRIM(a.rep_id::text), ''), NULLIF(TRIM(a.rep_name::text), ''), 'Unassigned') = p_entity_key)
    )
    AND (p_manager_id IS NULL OR a.manager_id = p_manager_id)
    AND (p_customer_ids IS NULL OR lower(a.customer_id::text) = ANY(p_customer_ids))
    AND (p_brand_cats IS NULL
         OR array_length(p_brand_cats, 1) IS NULL
         OR COALESCE(a.brand_category, '') = ANY(p_brand_cats))
    AND (p_skus IS NULL OR array_length(p_skus, 1) IS NULL OR a.sku = ANY(p_skus))
    AND (effective.rep_ids IS NULL
         OR (NULLIF(TRIM(a.rep_id::text), '') IS NOT NULL
             AND lower(TRIM(a.rep_id::text)) = ANY(effective.rep_ids)))
  ORDER BY a.order_date DESC, a.order_number, a.sku
  LIMIT  p_limit
  OFFSET p_offset
$function$;
