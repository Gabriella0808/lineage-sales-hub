-- ══════════════════════════════════════════════════════════════════════════════
-- Repoint the Open SO calendar event branch onto the canonical Open SO view.
--
-- WHY: v_portal_inventory_calendar_events' 'open_so_ship' branch reads from
-- acctivate_open_sales_orders / acctivate_open_sales_order_lines — a table
-- pair that has been empty (0 rows) since before this work started, and
-- permanently so now that sync-open-sales-orders.ps1 was rewritten to write
-- into portal_acctivate_orders/portal_acctivate_order_lines instead (see
-- 20260910000600 — deliberate: that table pair is shared with booking
-- actuals, so it's upsert-only and was never safe to feed via the old
-- script's destructive full-table DELETE). The calendar's Open SO events
-- have therefore never had real data. The PO event branches (open_po_arrival,
-- po_invoice_due) are untouched — different tables, different sync script,
-- out of scope here.
--
-- v_portal_open_so_backlog (defined alongside the calendar view) has no
-- frontend consumer at all (confirmed via repo-wide search) — left as-is,
-- not touched.
--
-- Also exposes workflow_status on v_portal_open_sales_order_line_facts
-- (purely additive column — every frontend .select() lists explicit column
-- names, none use select("*"), so this cannot break an existing consumer)
-- so the calendar can show which open stage each order is in.
-- ══════════════════════════════════════════════════════════════════════════════

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
    o.workflow_status,
    o.customer_id,
    dl.name::text                                                            AS dealer_lookup_name,
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
    AND ol.qty_outstanding > 0
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
  manager_id,
  workflow_status
FROM lines;

GRANT SELECT ON public.v_portal_open_sales_order_line_facts TO anon, authenticated;

-- ─── Calendar: repoint 'open_so_ship' onto the canonical view ─────────────
-- PO branches (open_po_arrival, po_invoice_due) are byte-for-byte unchanged.

DROP VIEW IF EXISTS public.v_portal_inventory_calendar_events;
CREATE VIEW public.v_portal_inventory_calendar_events
WITH (security_invoker = true) AS

-- ── Event 1: Open SO ship dates (canonical Open SO view) ───────────────────
SELECT
  'open_so_ship'::text                                          AS event_type,
  a.requested_ship_date                                         AS event_date,
  EXTRACT(YEAR  FROM a.requested_ship_date)::integer             AS year,
  EXTRACT(MONTH FROM a.requested_ship_date)::integer             AS month,
  a.order_number                                                AS source_doc_number,
  a.customer_id,
  a.dealer_name,
  NULL::text                                                    AS vendor_name,
  NULL::text                                                    AS container_number,
  a.sku,
  a.description,
  a.qty_open                                                    AS qty,
  COALESCE(a.open_so_amount, 0)                                 AS amount,
  a.warehouse,
  a.workflow_status                                             AS status,
  a.rep_name,
  jsonb_build_object(
    'guid_order',   a.guid_order,
    'stock_class',  a.product_class,
    'category',     a.sales_category
  )                                                              AS detail_json
FROM public.v_portal_open_sales_order_line_facts a

UNION ALL

-- ── Event 2: Open PO arrivals (container ETA / expected receipt) — unchanged
SELECT
  'open_po_arrival'::text,
  COALESCE(l.eta_date, l.expected_receipt_date, h.eta_date, h.expected_receipt_date),
  EXTRACT(YEAR  FROM COALESCE(l.eta_date, l.expected_receipt_date, h.eta_date, h.expected_receipt_date))::integer,
  EXTRACT(MONTH FROM COALESCE(l.eta_date, l.expected_receipt_date, h.eta_date, h.expected_receipt_date))::integer,
  l.po_number,
  NULL::text,
  NULL::text,
  COALESCE(l.vendor_name,      h.vendor_name),
  COALESCE(l.container_number, h.container_number),
  l.product_id,
  l.description,
  l.qty_open,
  COALESCE(l.open_amount, 0),
  COALESCE(l.warehouse, h.warehouse),
  h.po_status,
  NULL::text,
  jsonb_build_object(
    'guid_po',       l.guid_po,
    'product_class', l.product_class
  )
FROM public.acctivate_open_purchase_order_lines l
LEFT JOIN public.acctivate_open_purchase_orders h ON h.guid_po = l.guid_po
WHERE l.qty_open > 0

UNION ALL

-- ── Event 3: PO invoice due dates — unchanged ───────────────────────────────
SELECT
  'po_invoice_due'::text,
  COALESCE(l.invoice_due_date, h.invoice_due_date),
  EXTRACT(YEAR  FROM COALESCE(l.invoice_due_date, h.invoice_due_date))::integer,
  EXTRACT(MONTH FROM COALESCE(l.invoice_due_date, h.invoice_due_date))::integer,
  l.po_number,
  NULL::text,
  NULL::text,
  COALESCE(l.vendor_name,      h.vendor_name),
  COALESCE(l.container_number, h.container_number),
  l.product_id,
  l.description,
  l.qty_open,
  COALESCE(l.open_amount, 0),
  COALESCE(l.warehouse, h.warehouse),
  h.po_status,
  NULL::text,
  jsonb_build_object(
    'guid_po',       l.guid_po,
    'product_class', l.product_class
  )
FROM public.acctivate_open_purchase_order_lines l
LEFT JOIN public.acctivate_open_purchase_orders h ON h.guid_po = l.guid_po
WHERE l.qty_open > 0
  AND COALESCE(l.invoice_due_date, h.invoice_due_date) IS NOT NULL;

GRANT SELECT ON public.v_portal_inventory_calendar_events TO authenticated, anon, service_role;

-- ─── Drill-down / KPI RPC — re-created only because the view it reads from
-- was just DROP/CREATE'd above; body/signature unchanged from 20260910000600.
-- ─────────────────────────────────────────────────────────────────────────

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
-- VALIDATION
--
-- select count(*) from public.v_portal_inventory_calendar_events where event_type = 'open_so_ship';
-- -- should now be > 0 and roughly match v_portal_open_sales_order_line_facts's row count
--
-- select count(distinct order_number) as open_orders, count(*) as open_lines,
--   round(sum(qty_open),2) as open_units, round(sum(open_so_amount),2) as open_so_value
-- from public.v_portal_open_sales_order_line_facts;
-- ══════════════════════════════════════════════════════════════════════════════
