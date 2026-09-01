-- ══════════════════════════════════════════════════════════════════════════════
-- Open SO / Open PO Calendar — tables and views
-- Backs Inventory > Backlog > Calendar View
--
-- New tables (direct-sync targets, keyed on Acctivate GUIDs):
--   acctivate_open_sales_orders           — SO headers
--   acctivate_open_sales_order_lines      — SO lines
--   acctivate_open_purchase_orders        — PO headers
--   acctivate_open_purchase_order_lines   — PO lines
--
-- New views:
--   v_portal_open_so_backlog              — feeds Backlog (Open Orders) card
--   v_portal_open_po_summary             — feeds Total Open POs card/detail
--   v_portal_inventory_calendar_events   — feeds Calendar View (3 event types)
-- ══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Open Sales Order Headers
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acctivate_open_sales_orders (
  guid_order               TEXT        NOT NULL,
  order_number             TEXT,
  order_type               TEXT,
  order_status             TEXT,
  order_date               DATE,
  entry_date               DATE,
  requested_ship_date      DATE,
  scheduled_ship_date      DATE,
  customer_id              TEXT,
  dealer_name              TEXT,
  guid_customer            TEXT,
  guid_salesperson         TEXT,
  sales_rep_id             TEXT,
  rep_name                 TEXT,
  branch_id                TEXT,
  warehouse                TEXT,
  subtotal                 NUMERIC,
  net_open_amount          NUMERIC,
  freight_amount           NUMERIC,
  tariff_amount            NUMERIC,
  source                   TEXT NOT NULL DEFAULT 'direct_sync',
  source_synced_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guid_order)
);

ALTER TABLE public.acctivate_open_sales_orders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'acctivate_open_sales_orders'
      AND policyname = 'Authenticated read acctivate_open_sales_orders'
  ) THEN
    CREATE POLICY "Authenticated read acctivate_open_sales_orders"
      ON public.acctivate_open_sales_orders FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_open_so_order_date
  ON public.acctivate_open_sales_orders (order_date);
CREATE INDEX IF NOT EXISTS idx_open_so_ship_date
  ON public.acctivate_open_sales_orders (requested_ship_date);
CREATE INDEX IF NOT EXISTS idx_open_so_customer
  ON public.acctivate_open_sales_orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_open_so_status
  ON public.acctivate_open_sales_orders (order_status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Open Sales Order Lines
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acctivate_open_sales_order_lines (
  guid_order_detail        TEXT        NOT NULL,
  guid_order               TEXT        NOT NULL,
  order_number             TEXT,
  order_status             TEXT,
  order_date               DATE,
  requested_ship_date      DATE,
  customer_id              TEXT,
  dealer_name              TEXT,
  rep_name                 TEXT,
  warehouse                TEXT,
  product_id               TEXT,
  description              TEXT,
  product_class            TEXT,
  sales_category           TEXT,
  qty_ordered              NUMERIC     NOT NULL DEFAULT 0,
  qty_shipped              NUMERIC     NOT NULL DEFAULT 0,
  qty_invoiced             NUMERIC     NOT NULL DEFAULT 0,
  qty_open                 NUMERIC     NOT NULL DEFAULT 0,
  original_price           NUMERIC,
  line_discount_pct        NUMERIC,
  amount                   NUMERIC,
  tariff_amount            NUMERIC,
  freight_amount           NUMERIC,
  net_open_amount          NUMERIC,
  source                   TEXT NOT NULL DEFAULT 'direct_sync',
  source_synced_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guid_order_detail)
);

ALTER TABLE public.acctivate_open_sales_order_lines ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'acctivate_open_sales_order_lines'
      AND policyname = 'Authenticated read acctivate_open_sales_order_lines'
  ) THEN
    CREATE POLICY "Authenticated read acctivate_open_sales_order_lines"
      ON public.acctivate_open_sales_order_lines FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_open_so_lines_guid_order
  ON public.acctivate_open_sales_order_lines (guid_order);
CREATE INDEX IF NOT EXISTS idx_open_so_lines_product
  ON public.acctivate_open_sales_order_lines (product_id);
CREATE INDEX IF NOT EXISTS idx_open_so_lines_ship_date
  ON public.acctivate_open_sales_order_lines (requested_ship_date);
CREATE INDEX IF NOT EXISTS idx_open_so_lines_customer
  ON public.acctivate_open_sales_order_lines (customer_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Open Purchase Order Headers
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acctivate_open_purchase_orders (
  guid_po                  TEXT        NOT NULL,
  po_number                TEXT,
  vendor_name              TEXT,
  vendor_id                TEXT,
  warehouse                TEXT,
  container_number         TEXT,
  po_status                TEXT,
  po_date                  DATE,
  expected_ship_date       DATE,
  expected_receipt_date    DATE,
  eta_date                 DATE,
  invoice_due_date         DATE,
  total_amount             NUMERIC,
  open_amount              NUMERIC,
  source                   TEXT NOT NULL DEFAULT 'direct_sync',
  source_synced_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guid_po)
);

ALTER TABLE public.acctivate_open_purchase_orders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'acctivate_open_purchase_orders'
      AND policyname = 'Authenticated read acctivate_open_purchase_orders'
  ) THEN
    CREATE POLICY "Authenticated read acctivate_open_purchase_orders"
      ON public.acctivate_open_purchase_orders FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_open_po_eta
  ON public.acctivate_open_purchase_orders (eta_date);
CREATE INDEX IF NOT EXISTS idx_open_po_receipt
  ON public.acctivate_open_purchase_orders (expected_receipt_date);
CREATE INDEX IF NOT EXISTS idx_open_po_invoice_due
  ON public.acctivate_open_purchase_orders (invoice_due_date);
CREATE INDEX IF NOT EXISTS idx_open_po_vendor
  ON public.acctivate_open_purchase_orders (vendor_id);
CREATE INDEX IF NOT EXISTS idx_open_po_status
  ON public.acctivate_open_purchase_orders (po_status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Open Purchase Order Lines
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.acctivate_open_purchase_order_lines (
  guid_po_detail           TEXT        NOT NULL,
  guid_po                  TEXT        NOT NULL,
  po_number                TEXT,
  vendor_name              TEXT,
  warehouse                TEXT,
  container_number         TEXT,
  expected_receipt_date    DATE,
  eta_date                 DATE,
  invoice_due_date         DATE,
  product_id               TEXT,
  description              TEXT,
  product_class            TEXT,
  qty_ordered              NUMERIC     NOT NULL DEFAULT 0,
  qty_received             NUMERIC     NOT NULL DEFAULT 0,
  qty_open                 NUMERIC     NOT NULL DEFAULT 0,
  unit_cost                NUMERIC,
  open_amount              NUMERIC,
  total_amount             NUMERIC,
  source                   TEXT NOT NULL DEFAULT 'direct_sync',
  source_synced_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guid_po_detail)
);

ALTER TABLE public.acctivate_open_purchase_order_lines ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'acctivate_open_purchase_order_lines'
      AND policyname = 'Authenticated read acctivate_open_purchase_order_lines'
  ) THEN
    CREATE POLICY "Authenticated read acctivate_open_purchase_order_lines"
      ON public.acctivate_open_purchase_order_lines FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_open_po_lines_guid_po
  ON public.acctivate_open_purchase_order_lines (guid_po);
CREATE INDEX IF NOT EXISTS idx_open_po_lines_product
  ON public.acctivate_open_purchase_order_lines (product_id);
CREATE INDEX IF NOT EXISTS idx_open_po_lines_eta
  ON public.acctivate_open_purchase_order_lines (eta_date);
CREATE INDEX IF NOT EXISTS idx_open_po_lines_receipt
  ON public.acctivate_open_purchase_order_lines (expected_receipt_date);
CREATE INDEX IF NOT EXISTS idx_open_po_lines_invoice_due
  ON public.acctivate_open_purchase_order_lines (invoice_due_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. View: v_portal_open_so_backlog
-- Feeds Inventory > Backlog (Open Orders) card and table
-- LEFT JOINs so no line is dropped due to a missing header.
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_portal_open_so_backlog;
CREATE VIEW public.v_portal_open_so_backlog
WITH (security_invoker = true) AS
SELECT
  l.guid_order_detail,
  l.guid_order,
  l.order_number,
  COALESCE(l.order_status, h.order_status)                    AS order_status,
  COALESCE(l.order_date,   h.order_date)                      AS order_date,
  COALESCE(l.requested_ship_date, h.requested_ship_date)      AS ship_date,
  COALESCE(l.customer_id,  h.customer_id)                     AS customer_id,
  COALESCE(l.dealer_name,  h.dealer_name)                     AS dealer_name,
  COALESCE(l.rep_name,     h.rep_name)                        AS rep_name,
  COALESCE(l.warehouse,    h.warehouse)                       AS warehouse,
  l.product_id                                                AS sku,
  l.description,
  l.product_class,
  l.sales_category,
  l.qty_ordered,
  l.qty_shipped,
  l.qty_invoiced,
  l.qty_open,
  l.original_price,
  l.line_discount_pct,
  l.amount,
  l.net_open_amount,
  -- Days until ship (negative = overdue)
  CASE
    WHEN COALESCE(l.requested_ship_date, h.requested_ship_date) IS NULL THEN NULL
    ELSE (COALESCE(l.requested_ship_date, h.requested_ship_date) - CURRENT_DATE)::integer
  END AS days_until_ship,
  -- Urgency label
  CASE
    WHEN COALESCE(l.requested_ship_date, h.requested_ship_date) IS NULL
         THEN 'Unscheduled'
    WHEN COALESCE(l.requested_ship_date, h.requested_ship_date) < CURRENT_DATE
         THEN 'Overdue'
    WHEN COALESCE(l.requested_ship_date, h.requested_ship_date) <= CURRENT_DATE + 7
         THEN 'Due Soon'
    ELSE 'Upcoming'
  END AS ship_status,
  l.source_synced_at
FROM public.acctivate_open_sales_order_lines l
LEFT JOIN public.acctivate_open_sales_orders h ON h.guid_order = l.guid_order
WHERE l.qty_open > 0;

GRANT SELECT ON public.v_portal_open_so_backlog TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. View: v_portal_open_po_summary
-- Feeds Total Open POs card and PO detail
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_portal_open_po_summary;
CREATE VIEW public.v_portal_open_po_summary
WITH (security_invoker = true) AS
SELECT
  l.guid_po_detail,
  l.guid_po,
  l.po_number,
  COALESCE(l.vendor_name,          h.vendor_name)          AS vendor_name,
  COALESCE(l.warehouse,            h.warehouse)            AS warehouse,
  COALESCE(l.container_number,     h.container_number)     AS container_number,
  COALESCE(l.expected_receipt_date,h.expected_receipt_date)AS expected_receipt_date,
  COALESCE(l.eta_date,             h.eta_date)             AS eta_date,
  COALESCE(l.invoice_due_date,     h.invoice_due_date)     AS invoice_due_date,
  h.po_status,
  h.po_date,
  l.product_id                                             AS sku,
  l.description,
  l.product_class,
  l.qty_ordered,
  l.qty_received,
  l.qty_open,
  l.unit_cost,
  l.open_amount,
  l.total_amount,
  l.source_synced_at
FROM public.acctivate_open_purchase_order_lines l
LEFT JOIN public.acctivate_open_purchase_orders h ON h.guid_po = l.guid_po
WHERE l.qty_open > 0;

GRANT SELECT ON public.v_portal_open_po_summary TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. View: v_portal_inventory_calendar_events
-- Three event types combined for the calendar:
--   open_so_ship    — Open SOs by ship date
--   open_po_arrival — Open POs / containers arriving (ETA)
--   po_invoice_due  — PO invoices expected (invoice due date)
-- Rows with null dates are included (year/month = NULL → "Unscheduled" bucket)
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_portal_inventory_calendar_events;
CREATE VIEW public.v_portal_inventory_calendar_events
WITH (security_invoker = true) AS

-- ── Event 1: Open SO ship dates ───────────────────────────────────────────────
SELECT
  'open_so_ship'::text                                          AS event_type,
  COALESCE(l.requested_ship_date, h.requested_ship_date)       AS event_date,
  EXTRACT(YEAR  FROM COALESCE(l.requested_ship_date, h.requested_ship_date))::integer AS year,
  EXTRACT(MONTH FROM COALESCE(l.requested_ship_date, h.requested_ship_date))::integer AS month,
  l.order_number                                                AS source_doc_number,
  COALESCE(l.customer_id, h.customer_id)                       AS customer_id,
  COALESCE(l.dealer_name, h.dealer_name)                       AS dealer_name,
  NULL::text                                                    AS vendor_name,
  NULL::text                                                    AS container_number,
  l.product_id                                                  AS sku,
  l.description,
  l.qty_open                                                    AS qty,
  COALESCE(l.net_open_amount, l.amount, 0)                     AS amount,
  COALESCE(l.warehouse, h.warehouse)                           AS warehouse,
  COALESCE(l.order_status, h.order_status)                     AS status,
  COALESCE(l.rep_name, h.rep_name)                             AS rep_name,
  jsonb_build_object(
    'guid_order',   l.guid_order,
    'stock_class',  l.product_class,
    'category',     l.sales_category
  )                                                             AS detail_json
FROM public.acctivate_open_sales_order_lines l
LEFT JOIN public.acctivate_open_sales_orders h ON h.guid_order = l.guid_order
WHERE l.qty_open > 0

UNION ALL

-- ── Event 2: Open PO arrivals (container ETA / expected receipt) ───────────────
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

-- ── Event 3: PO invoice due dates ─────────────────────────────────────────────
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

NOTIFY pgrst, 'reload schema';
