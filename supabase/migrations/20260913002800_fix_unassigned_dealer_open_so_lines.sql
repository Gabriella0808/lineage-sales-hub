-- ══════════════════════════════════════════════════════════════════════════════
-- Same bug as 20260913001700 (Unmatched/Unassigned Dealer bookings/
-- invoiced detail rows), but in get_open_sales_order_lines instead of
-- get_sales_reporting_detail_lines - never fixed there at the time.
--
-- get_sales_reporting_grouped_rows' dealer branch already sums Open SO
-- for the Unmatched bucket correctly (20260913002000's unmatched_open_so
-- CTE) - the parent Open Sales Orders card correctly showed $3,350.40.
-- But get_open_sales_order_lines (the drawer's detail-line fetch) matched
-- dealers by literal equality against customer_id, and 'UNASSIGNED_DEALER'
-- is a synthetic label that never equals any real customer_id - so the
-- drawer always returned 0 rows/$0 for that one row, regardless of which
-- other dealer was selected.
--
-- Fix: when p_group_by='dealer' and p_entity_key='UNASSIGNED_DEALER', use
-- the identical "not in the matched dealer roster" predicate the
-- parent's unmatched_open_so CTE already uses, instead of an equality
-- match. Every other entity_key (a real customer_id, or the 'rep'
-- branch) is completely unaffected - same predicate as before.
--
-- Nothing else changes: qty/price/discount formula, dealer/rep
-- attribution, all other filters - byte-for-byte identical to the prior
-- version of this function.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_open_sales_order_lines(
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
  fulfillment_type text, warehouse text, sku text, description text,
  product_class text, brand_category text, qty_ordered numeric, qty_shipped numeric,
  qty_open numeric, unit_price numeric, line_discount_pct numeric, net_open_amount numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    a.guid_order, a.order_number, a.order_date, a.requested_ship_date,
    a.customer_id, a.dealer_name, a.rep_id, a.rep_name,
    a.fulfillment_type, a.warehouse, a.sku, a.description, a.product_class,
    a.brand_category, a.qty_ordered, a.qty_shipped, a.qty_open,
    a.unit_price, a.line_discount_pct, a.open_so_amount
  FROM public.v_portal_open_sales_order_line_facts a
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
    AND (p_rep_ids IS NULL
         OR (NULLIF(TRIM(a.rep_id::text), '') IS NOT NULL
             AND lower(TRIM(a.rep_id::text)) = ANY(p_rep_ids)))
  ORDER BY a.order_date DESC, a.order_number, a.sku
  LIMIT  p_limit
  OFFSET p_offset
$function$;

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- 1. Unmatched Open SO detail rows now reconcile to the parent total:
--    SELECT count(*), round(sum(net_open_amount)::numeric,2)
--    FROM get_open_sales_order_lines(p_group_by:='dealer', p_entity_key:='UNASSIGNED_DEALER',
--      p_customer_ids:=NULL, p_brand_cats:=NULL, p_skus:=NULL, p_rep_ids:=NULL,
--      p_manager_id:=NULL, p_limit:=1000, p_offset:=0);
--    -- expect sum = 3350.40 (BOSTONINT's open orders)
--
-- 2. A real dealer (e.g. Roomstogo.com Inc) still reconciles exactly as
--    before - unaffected by this change.
-- ══════════════════════════════════════════════════════════════════════════════
