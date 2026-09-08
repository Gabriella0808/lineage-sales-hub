-- ══════════════════════════════════════════════════════════════════════════════
-- Open Sales Order line-facts: switch source + match Andrew's validated query.
--
-- WHY: dbo_Orders/dbo_OrderDetail (the previous source) is a stale, abandoned
-- raw mirror — last updated 2026-07-08, 535 rows. portal_acctivate_orders /
-- portal_acctivate_order_lines (fed by sync-aug-current-bookings.ps1 +
-- sync-jan-jul-historical-bookings.ps1) is the only live pipeline: synced as
-- of today, 1,871 orders spanning 2025-01-17 to present.
--
-- Open-order definition now matches Andrew's SSMS-validated query exactly:
--   Header:  WorkflowStatus IN ('Not Ready to Pick','Ready to Pick',
--                                'Pick In Progress','Partially Invoiced')
--   Line:    LineCancelled = 0 OR NULL, ProductID IS NOT NULL, trim <> ''
--   Qty:     qty_open       = QtyOutstanding
--   Amount:  open_so_amount = Price * QtyOutstanding
-- No QtyOrdered-QtyShipped, no _OriginalPrice, no discount adjustment.
--
-- workflow_status / qty_outstanding / price columns already exist on
-- portal_acctivate_orders / portal_acctivate_order_lines (added in an earlier
-- session) but were 100% unpopulated — sync-aug-current-bookings.ps1 has been
-- updated separately to pull them. This view will return 0 rows until that
-- updated script actually runs on the VM.
-- ══════════════════════════════════════════════════════════════════════════════

-- Safety net — no-op if these already exist (confirmed present via
-- information_schema before writing this migration).
ALTER TABLE public.portal_acctivate_orders
  ADD COLUMN IF NOT EXISTS workflow_status text;

ALTER TABLE public.portal_acctivate_order_lines
  ADD COLUMN IF NOT EXISTS qty_outstanding numeric,
  ADD COLUMN IF NOT EXISTS price           numeric;

DROP FUNCTION IF EXISTS public.get_open_sales_order_lines(text,text,text[],text[],text[],text[],uuid,int,int);
DROP VIEW IF EXISTS public.v_portal_open_sales_order_line_facts;

CREATE OR REPLACE VIEW public.v_portal_open_sales_order_line_facts AS
WITH real_reps AS (
  SELECT
    sr.id           AS portal_rep_id,
    sr.name         AS canonical_rep_name,
    sr.acctivate_id AS canonical_rep_key,
    sr.manager_id
  FROM public.sales_reps sr
  WHERE
    NULLIF(TRIM(sr.acctivate_id), '') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.territories t
      WHERE LOWER(TRIM(t.name)) = LOWER(TRIM(sr.name))
    )
),
lines AS (
  SELECT
    o.guid_order                                                             AS raw_guid_order,
    o.order_number,
    o.order_date::date                                                       AS order_date,
    o.requested_ship_date::date                                              AS requested_ship_date,
    o.customer_id,
    dl.name::text                                                            AS dealer_lookup_name,
    -- rep_id: SalespersonID (via rep1, fixed in the sync script to pull the
    -- actually-populated field), falling back to rep2 (_Rep2) — same chain
    -- the prior dbo_Orders-sourced view used, just renamed at the source.
    COALESCE(NULLIF(TRIM(o.rep1), ''), NULLIF(TRIM(o.rep2), ''), '')        AS rep_id,
    COALESCE(
      NULLIF(TRIM(asr.name::text), ''),
      NULLIF(TRIM(o.rep1), ''),
      NULLIF(TRIM(o.rep2), ''),
      'Unassigned'
    )                                                                        AS rep_name,
    o.branch_id,
    CASE UPPER(COALESCE(o.branch_id, ''))
      WHEN 'MIXED'   THEN 'container'
      WHEN 'DIRECT'  THEN 'container'
      WHEN 'WHSALES' THEN 'warehouse'
      ELSE 'unclassified'
    END                                                                      AS fulfillment_type,
    NULL::text                                                               AS warehouse,
    ol.product_id                                                            AS sku,
    ol.description,
    ol.product_class,
    ol.sales_category,
    CASE
      WHEN ol.sales_category = 'SW'                          THEN 'Sea Winds'
      WHEN ol.sales_category IN ('FL', 'FINNLOU')             THEN 'Finn & Lou'
      WHEN UPPER(COALESCE(ol.sales_category, '')) = 'LUX'     THEN 'Lux'
      WHEN ol.sales_category = 'ALLOW'
        OR COALESCE(ol.sales_category, '') = ''                THEN 'ALLOW'
      ELSE NULL
    END                                                                      AS brand_category,
    COALESCE(NULLIF(TRIM(ol.qty_ordered), '')::numeric, 0)                  AS qty_ordered,
    COALESCE(NULLIF(TRIM(ol.qty_shipped), '')::numeric, 0)                  AS qty_shipped,
    ol.qty_outstanding,
    ol.price,
    COALESCE(NULLIF(TRIM(ol.line_discount_pct), '')::numeric, 0)            AS line_discount_pct,
    rr.manager_id
  FROM public.portal_acctivate_orders o
  JOIN public.portal_acctivate_order_lines ol
    ON ol.guid_order = o.guid_order
  LEFT JOIN public.dealers dl
    ON dl.acctivate_id = o.customer_id
  LEFT JOIN public.acctivate_sales_reps asr
    ON LOWER(TRIM(asr.acctivate_id)) = LOWER(TRIM(
         COALESCE(NULLIF(TRIM(o.rep1), ''), NULLIF(TRIM(o.rep2), ''))
       ))
  LEFT JOIN real_reps rr
    ON LOWER(TRIM(rr.canonical_rep_key)) = LOWER(TRIM(
         COALESCE(NULLIF(TRIM(o.rep1), ''), NULLIF(TRIM(o.rep2), ''))
       ))
  WHERE o.workflow_status IN (
          'Not Ready to Pick', 'Ready to Pick', 'Pick In Progress', 'Partially Invoiced'
        )
    AND (ol.line_cancelled = false OR ol.line_cancelled IS NULL)
    AND ol.product_id IS NOT NULL
    AND TRIM(ol.product_id) <> ''
)
SELECT
  LOWER(REPLACE(REPLACE(raw_guid_order::text, '{', ''), '}', ''))            AS guid_order,
  order_number,
  order_date,
  requested_ship_date,
  customer_id,
  COALESCE(NULLIF(TRIM(dealer_lookup_name), ''), customer_id)                AS dealer_name,
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
  qty_outstanding                                                           AS qty_open,
  price                                                                      AS unit_price,
  line_discount_pct,
  ROUND(price * qty_outstanding, 2)                                         AS open_so_amount,
  manager_id
FROM lines;

GRANT SELECT ON public.v_portal_open_sales_order_line_facts TO anon, authenticated;

-- ─── Drill-down / KPI RPC — unchanged signature/entity_key formula; just
-- reads from the rebuilt view above. ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_open_sales_order_lines(
  p_group_by     text,
  p_entity_key   text,
  p_customer_ids text[]  DEFAULT NULL,
  p_brand_cats   text[]  DEFAULT NULL,
  p_skus         text[]  DEFAULT NULL,
  p_rep_ids      text[]  DEFAULT NULL,
  p_manager_id   uuid    DEFAULT NULL,
  p_limit        int     DEFAULT 2000,
  p_offset       int     DEFAULT 0
)
RETURNS TABLE (
  guid_order          text,
  order_number        text,
  order_date          date,
  requested_ship_date date,
  customer_id         text,
  dealer_name         text,
  rep_id              text,
  rep_name             text,
  fulfillment_type     text,
  warehouse             text,
  sku                   text,
  description           text,
  product_class         text,
  brand_category        text,
  qty_ordered           numeric,
  qty_shipped           numeric,
  qty_open              numeric,
  unit_price            numeric,
  line_discount_pct     numeric,
  net_open_amount       numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    a.guid_order, a.order_number, a.order_date, a.requested_ship_date,
    a.customer_id, a.dealer_name, a.rep_id, a.rep_name,
    a.fulfillment_type, a.warehouse, a.sku, a.description, a.product_class,
    a.brand_category, a.qty_ordered, a.qty_shipped, a.qty_open,
    a.unit_price, a.line_discount_pct, a.open_so_amount
  FROM public.v_portal_open_sales_order_line_facts a
  WHERE
    (
      (p_group_by = 'dealer'
       AND COALESCE(NULLIF(TRIM(a.customer_id::text), ''), 'Unknown') = p_entity_key)
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
$$;

GRANT EXECUTE ON FUNCTION public.get_open_sales_order_lines(
  text, text, text[], text[], text[], text[], uuid, int, int
) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION — run after the VM has run the updated sync-aug-current-bookings.ps1
-- (workflow_status/qty_outstanding/price are 100% NULL until then, so this
-- view returns 0 rows against current data).
--
-- Target (Andrew, SSMS): ~495 open orders / ~4,111 open lines /
--                         ~11,922 open units / ~$2,503,968.28
--
-- select count(distinct order_number) as open_orders, count(*) as open_lines,
--   round(sum(qty_open),2) as open_units, round(sum(open_so_amount),2) as open_so_value
-- from public.v_portal_open_sales_order_line_facts;
-- ══════════════════════════════════════════════════════════════════════════════
