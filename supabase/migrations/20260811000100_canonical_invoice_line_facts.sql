-- Rebuild invoice actuals to match Andrew's spreadsheet exactly.
--
-- Andrew's formula:  net_amount = Price * QtyInvoiced * (1 - LineDiscountPct/100)
-- Andrew's filter:   Product.SalesCategory IN ('SW','FINNLOU','LUX','ALLOW')
-- Display mapping:   SW→Sea Winds, FINNLOU→Finn & Louise, LUX→Lux Lighting, ALLOW→MISC
--
-- In our portal tables, product_class is the per-line collection code.
-- unit_price is NULL in portal_acctivate_invoice_lines (not synced), so we use
-- line_amount (= invoice_detail_amount) which is the pre-calculated net amount —
-- the same result as Price * QtyInvoiced * (1 - LineDiscountPct/100).
--
-- Codes added vs old whitelist: MAUI, CLOSEOUT, QCFACTOR, QCFREIGH, RETURN
-- Codes removed vs old whitelist: none (old ones stay, description fallback replaced)
-- The old description fallback excluded tariff/freight charges too loosely;
-- this replaces it with a strict product_class + product_id lookup.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Canonical SalesCategory resolver
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
    -- ── Sea Winds ────────────────────────────────────────────────────────────
    WHEN 'ISLAMORA'  THEN 'SW'
    WHEN 'CREDENZA'  THEN 'SW'
    WHEN 'MONBLANC'  THEN 'SW'
    WHEN 'MONBLEU'   THEN 'SW'
    WHEN 'OCEANISL'  THEN 'SW'
    WHEN 'PICKET'    THEN 'SW'
    WHEN 'SURFSIDE'  THEN 'SW'
    WHEN 'CMAYDRIF'  THEN 'SW'
    WHEN 'MIRAMAR'   THEN 'SW'
    WHEN 'MAUI'      THEN 'SW'
    -- ── Finn & Louise ────────────────────────────────────────────────────────
    WHEN 'CABBED'    THEN 'FINNLOU'
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
    -- ── Allowances → displayed as MISC ───────────────────────────────────────
    WHEN 'ECOMMALL'  THEN 'ALLOW'
    WHEN 'QCFACTOR'  THEN 'ALLOW'
    WHEN 'QCFREIGH'  THEN 'ALLOW'
    WHEN 'RETURN'    THEN 'ALLOW'
    -- ── Closeout: sub-categorise by product_id prefix ─────────────────────────
    WHEN 'CLOSEOUT'  THEN
      CASE
        WHEN upper(p_product_id) LIKE 'LUX%'
          OR upper(p_product_id) LIKE 'C:LUX%'  THEN 'LUX'
        WHEN upper(p_product_id) LIKE 'FL-%'
          OR upper(p_product_id) LIKE 'C:FL-%'  THEN 'FINNLOU'
        ELSE 'SW'
      END
    ELSE NULL  -- excluded (MISC/tariff, SHIP/freight, IMPORT, taxes, etc.)
  END
$$;

GRANT EXECUTE ON FUNCTION public.resolve_invoice_sales_category(text, text)
  TO authenticated, anon, service_role;

-- Keep the old is_portal_invoice_line signature for any callers; delegate to new fn.
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
-- 2. Canonical invoice line facts view
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_portal_invoice_line_facts AS
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
      pail.product_class::text, pail.product_id::text
    )                                                                     AS sales_category,
    COALESCE(pail.quantity::numeric, 0)                                   AS qty_invoiced,
    COALESCE(pail.unit_price::numeric, 0)                                 AS price,
    0::numeric                                                            AS line_discount_pct,
    COALESCE(
      pail.line_amount::numeric,
      pail.invoice_detail_amount::numeric,
      0
    )                                                                     AS net_invoice_amount
  FROM public.portal_acctivate_invoices pai
  JOIN public.portal_acctivate_invoice_lines pail
    ON pail.guid_invoice::text = pai.guid_invoice::text
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
  qty_invoiced,
  price,
  line_discount_pct,
  net_invoice_amount
FROM raw
WHERE sales_category IS NOT NULL;

GRANT SELECT ON public.v_portal_invoice_line_facts TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Rebuild mv_portal_monthly_invoiced_actuals from the canonical view
-- ─────────────────────────────────────────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS public.mv_portal_monthly_invoiced_actuals;

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

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Rebuild get_portal_invoiced_lines() from the canonical view
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_portal_invoiced_lines()
RETURNS TABLE (
  metric_type      text,
  transaction_date date,
  year             int,
  month_number     int,
  dealer_name      text,
  customer_id      text,
  rep_name         text,
  rep_id           text,
  sku              text,
  description      text,
  brand_category   text,
  amount           numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    'invoiced'::text                              AS metric_type,
    f.invoice_date                                AS transaction_date,
    EXTRACT(YEAR  FROM f.invoice_date)::int       AS year,
    EXTRACT(MONTH FROM f.invoice_date)::int       AS month_number,
    f.dealer_name                                 AS dealer_name,
    f.customer_id                                 AS customer_id,
    f.salesperson_name                            AS rep_name,
    f.salesperson_id                              AS rep_id,
    f.product_id                                  AS sku,
    f.description                                 AS description,
    f.display_category                            AS brand_category,
    f.net_invoice_amount                          AS amount
  FROM public.v_portal_invoice_line_facts f
$$;

GRANT EXECUTE ON FUNCTION public.get_portal_invoiced_lines()
  TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Rebuild kpi_monthly_invoice_rollup() from the canonical view
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.kpi_monthly_invoice_rollup(
  p_years      int[],
  p_dealer_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  year               int,
  month              int,
  invoiced           numeric,
  invoiced_container numeric,
  invoiced_warehouse numeric,
  invoice_count      int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXTRACT(YEAR  FROM f.invoice_date)::int          AS year,
    EXTRACT(MONTH FROM f.invoice_date)::int          AS month,
    COALESCE(SUM(f.net_invoice_amount), 0)           AS invoiced,
    0::numeric                                       AS invoiced_container,
    0::numeric                                       AS invoiced_warehouse,
    COUNT(DISTINCT f.invoice_number)::int            AS invoice_count
  FROM public.v_portal_invoice_line_facts f
  LEFT JOIN public.dealers d ON d.acctivate_id = f.customer_id
  WHERE EXTRACT(YEAR FROM f.invoice_date)::int = ANY(p_years)
    AND (p_dealer_ids IS NULL OR d.id = ANY(p_dealer_ids))
  GROUP BY 1, 2
  ORDER BY 1, 2
$$;

GRANT EXECUTE ON FUNCTION public.kpi_monthly_invoice_rollup(int[], uuid[])
  TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification query (run manually to confirm correctness)
-- Expected Aug 2026 MTD (data through sync date):
--   Sea Winds    ~137,918  (will be lower due to sync lag vs Andrew's Excel)
--   Finn & Louise ~96,095
--   Lux Lighting  ~13,279
--   MISC            ~-201
-- ─────────────────────────────────────────────────────────────────────────────
/*
SELECT
  display_category,
  ROUND(SUM(net_invoice_amount), 2) AS total_amount
FROM public.v_portal_invoice_line_facts
WHERE invoice_date >= '2026-08-01'
  AND invoice_date < CURRENT_DATE + INTERVAL '1 day'
GROUP BY display_category
ORDER BY total_amount DESC;
*/
