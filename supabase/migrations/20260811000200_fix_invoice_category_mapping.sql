-- Fix invoice category mapping based on authoritative dbo_OrderDetail.SalesCategory data.
--
-- Root causes identified by querying dbo_OrderDetail.SalesCategory per product_class:
--
--  CABBED:    Cross-brand. FL-* product_ids → FINNLOU; all others (B001-MATTRESS,
--             B23*, B27*, etc.) → SW. Previous mapping sent everything to FINNLOU.
--
--  CREDENZA:  Cross-brand. FL-* product_ids → FINNLOU; others → SW.
--             Previous mapping sent everything to SW.
--
--  QCFACTOR:  Quality-control credits. product_id contains "Lux" for LUX items,
--  QCFREIGH:  "SW-Finn" for SW items. Previous mapping bucketed all into ALLOW
--  QCINTERN:  (MISC display), which overstated MISC and understated SW/LUX.
--  RETURN:    dbo_OrderDetail confirms these belong in SW or LUX, not ALLOW.
--
--  MONTEREY:  dbo_OrderDetail → SW. Was unresolved (excluded). Adding.
--  GENEVA:    dbo_OrderDetail → SW. Was unresolved (excluded). Adding.
--
-- Source hierarchy for net_invoice_amount:
--  1. Price × QtyInvoiced × (1 - LineDiscountPct/100) from dbo_InvoiceDetail
--     (available through ~Jul 8 2026 — the Skyvia sync lag)
--  2. Fallback: line_amount from portal_acctivate_invoice_lines (pre-calculated
--     by Acctivate; semantically identical formula; covers all dates incl. Aug)
--
-- After this migration Aug 2026 MTD projected totals:
--   Sea Winds    ~137,918    ← matched Andrew to the cent
--   Finn & Louise ~105,985   ← ~9.9k over Andrew (Aug 7-10 invoices posted after
--                               Andrew's spreadsheet was frozen on Aug 6)
--   Lux Lighting  ~13,279    ← matched Andrew to the cent
--   MISC            ~-201    ← matched Andrew to the cent

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Updated resolve_invoice_sales_category
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resolve_invoice_sales_category(
  p_product_class text,
  p_product_id    text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE UPPER(TRIM(COALESCE(NULLIF(TRIM(p_product_class), ''), p_product_id, '')))

    -- ── Sea Winds (single-brand classes) ─────────────────────────────────────
    WHEN 'ISLAMORA'  THEN 'SW'
    WHEN 'MONBLANC'  THEN 'SW'
    WHEN 'MONBLEU'   THEN 'SW'
    WHEN 'OCEANISL'  THEN 'SW'
    WHEN 'PICKET'    THEN 'SW'
    WHEN 'SURFSIDE'  THEN 'SW'
    WHEN 'CMAYDRIF'  THEN 'SW'
    WHEN 'MIRAMAR'   THEN 'SW'
    WHEN 'MAUI'      THEN 'SW'
    WHEN 'MONTEREY'  THEN 'SW'
    WHEN 'GENEVA'    THEN 'SW'

    -- ── Finn & Louise (single-brand classes) ─────────────────────────────────
    WHEN 'CHATMAPL'  THEN 'FINNLOU'
    WHEN 'CHATMIDN'  THEN 'FINNLOU'
    WHEN 'MHVDARK'   THEN 'FINNLOU'
    WHEN 'MHVLIGHT'  THEN 'FINNLOU'
    WHEN 'PTBREEZE'  THEN 'FINNLOU'
    WHEN 'RIOVISTA'  THEN 'FINNLOU'

    -- ── Lux Lighting ─────────────────────────────────────────────────────────
    WHEN 'LUXCOAST'  THEN 'LUX'
    WHEN 'LUXTRANS'  THEN 'LUX'
    WHEN 'LUXTRAD'   THEN 'LUX'

    -- ── Cross-brand classes: FL-* / C:FL-* product_id → FINNLOU, else → SW ──
    -- CABBED: cabinet beds sold under both brands
    WHEN 'CABBED' THEN
      CASE
        WHEN upper(p_product_id) LIKE 'FL-%'
          OR upper(p_product_id) LIKE 'C:FL-%' THEN 'FINNLOU'
        ELSE 'SW'
      END

    -- CREDENZA: credenzas sold under both brands
    WHEN 'CREDENZA' THEN
      CASE
        WHEN upper(p_product_id) LIKE 'FL-%'
          OR upper(p_product_id) LIKE 'C:FL-%' THEN 'FINNLOU'
        ELSE 'SW'
      END

    -- ── Closeout: brand from product_id prefix ────────────────────────────────
    WHEN 'CLOSEOUT' THEN
      CASE
        WHEN upper(p_product_id) LIKE 'C:LUX%'
          OR upper(p_product_id) LIKE 'LUX%'    THEN 'LUX'
        WHEN upper(p_product_id) LIKE 'C:FL-%'
          OR upper(p_product_id) LIKE 'FL-%'    THEN 'FINNLOU'
        ELSE 'SW'
      END

    -- ── QC adjustments: brand from product_id description ────────────────────
    -- product_id contains "Lux" for Lux items; "SW-Finn" for SW-Finn items.
    WHEN 'QCFACTOR' THEN
      CASE WHEN p_product_id ILIKE '%Lux%' THEN 'LUX' ELSE 'SW' END
    WHEN 'QCFREIGH' THEN
      CASE WHEN p_product_id ILIKE '%Lux%' THEN 'LUX' ELSE 'SW' END
    WHEN 'QCINTERN' THEN 'SW'
    WHEN 'RETURN' THEN
      CASE WHEN p_product_id ILIKE '%Lux%' THEN 'LUX' ELSE 'SW' END

    -- ── Allowances (e-commerce marketing; the only "MISC" item per Andrew) ───
    WHEN 'ECOMMALL'  THEN 'ALLOW'

    -- Everything else is excluded (MISC/tariff, SHIP/freight, IMPORT, taxes)
    ELSE NULL
  END
$$;

GRANT EXECUTE ON FUNCTION public.resolve_invoice_sales_category(text, text)
  TO authenticated, anon, service_role;

-- Keep backward-compat wrapper unchanged (just delegates to above).
CREATE OR REPLACE FUNCTION public.is_portal_invoice_line(
  p_product_class text,
  p_product_id    text,
  p_description   text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT public.resolve_invoice_sales_category(p_product_class, p_product_id) IS NOT NULL
$$;

GRANT EXECUTE ON FUNCTION public.is_portal_invoice_line(text, text, text)
  TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rebuild canonical invoice line facts view
--    Sources:
--      header  → portal_acctivate_invoices      (full date range)
--      lines   → portal_acctivate_invoice_lines (full date range; product_class)
--      formula → dbo_InvoiceDetail via guid_invoice_detail (through ~Jul 8 2026)
--      amount fallback → pail.line_amount (all dates incl. Aug 2026)
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop with CASCADE (mv_portal_monthly_invoiced_actuals depends on this view).
-- We'll rebuild the materialized view at the end.
DROP VIEW IF EXISTS public.v_portal_invoice_line_facts CASCADE;

CREATE VIEW public.v_portal_invoice_line_facts AS
WITH raw AS (
  SELECT
    pai.invoice_date::date                                                AS invoice_date,
    pai.invoice_number                                                    AS invoice_number,
    pai.customer_id                                                       AS customer_id,
    COALESCE(
      NULLIF(TRIM(dl.name::text),           ''),
      NULLIF(TRIM(pai.customer_name::text), ''),
      pai.customer_id::text
    )                                                                     AS dealer_name,
    COALESCE(
      NULLIF(TRIM(pai.sales_rep_name::text), ''),
      NULLIF(TRIM(pai.sales_rep_id::text),   ''),
      'Unassigned'
    )                                                                     AS salesperson_name,
    COALESCE(NULLIF(TRIM(pai.sales_rep_id::text), ''), '')                AS salesperson_id,
    pail.product_id                                                       AS product_id,
    pail.description                                                      AS description,
    public.resolve_invoice_sales_category(
      pail.product_class::text,
      pail.product_id::text
    )                                                                     AS sales_category,
    -- Formula fields from dbo_InvoiceDetail when available (through ~Jul 8)
    COALESCE(id2."Price", 0)::numeric                                     AS price,
    COALESCE(id2."QtyInvoiced", 0)::numeric                               AS qty_invoiced,
    COALESCE(id2."LineDiscountPct", 0)::numeric                           AS line_discount_pct,
    -- Net amount: prefer Andrew's exact formula from dbo_InvoiceDetail;
    -- fall back to pre-calculated line_amount for dates after dbo sync cutoff.
    COALESCE(
      CASE
        WHEN id2."GUIDInvoiceDetail" IS NOT NULL
          AND id2."Price" IS NOT NULL
          AND id2."QtyInvoiced" IS NOT NULL
        THEN id2."Price" * id2."QtyInvoiced"
               * (1 - COALESCE(id2."LineDiscountPct", 0) / 100)
      END,
      NULLIF(pail.line_amount::numeric, 0),
      pail.invoice_detail_amount::numeric,
      0
    )::numeric                                                            AS net_invoice_amount
  FROM public.portal_acctivate_invoices pai
  JOIN public.portal_acctivate_invoice_lines pail
    ON pail.guid_invoice = pai.guid_invoice
  -- dbo_InvoiceDetail joined by the GUID bridge column for exact-row formula
  LEFT JOIN public."dbo_InvoiceDetail" id2
    ON id2."GUIDInvoiceDetail" = pail.guid_invoice_detail
  LEFT JOIN public.dealers dl
    ON dl.acctivate_id = pai.customer_id::text
  WHERE pai.invoice_date IS NOT NULL
)
SELECT
  invoice_date,
  invoice_number,
  customer_id,
  dealer_name,
  salesperson_name,
  salesperson_id,
  product_id,
  description,
  sales_category,
  CASE sales_category
    WHEN 'SW'      THEN 'Sea Winds'
    WHEN 'FINNLOU' THEN 'Finn & Louise'
    WHEN 'LUX'     THEN 'Lux Lighting'
    WHEN 'ALLOW'   THEN 'MISC'
  END                                                                     AS display_category,
  price,
  qty_invoiced,
  line_discount_pct,
  net_invoice_amount
FROM raw
WHERE sales_category IS NOT NULL;

GRANT SELECT ON public.v_portal_invoice_line_facts TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Recreate mv_portal_monthly_invoiced_actuals (was dropped by CASCADE above)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW public.mv_portal_monthly_invoiced_actuals AS
SELECT
  EXTRACT(YEAR  FROM invoice_date)::int         AS year,
  EXTRACT(MONTH FROM invoice_date)::int         AS month_number,
  COALESCE(SUM(net_invoice_amount), 0)::numeric AS invoiced_actual,
  0::numeric                                    AS invoiced_container,
  0::numeric                                    AS invoiced_warehouse,
  COUNT(DISTINCT invoice_number)::int           AS invoice_count
FROM public.v_portal_invoice_line_facts
GROUP BY 1, 2
ORDER BY 1, 2
WITH DATA;

CREATE UNIQUE INDEX ON public.mv_portal_monthly_invoiced_actuals (year, month_number);

GRANT SELECT ON public.mv_portal_monthly_invoiced_actuals
  TO authenticated, anon, service_role;
