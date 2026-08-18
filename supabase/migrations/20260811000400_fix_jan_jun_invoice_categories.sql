-- Fix missing Jan-Jun 2026 invoiced actuals.
--
-- Root cause: portal_acctivate_invoice_lines.product_class is NULL for all
-- pre-July 2026 rows. Skyvia syncs only the live Acctivate product catalog;
-- products deleted after their invoice date lose their class in the sync.
-- The category resolver could not resolve NULL class → those rows were excluded.
--
-- Fix (view-layer only, no source data deleted):
--
-- 1. pid_class_map CTE: for each product_id that appears in ANY sync batch
--    with a known product_class, record that mapping. Strips the "(deleted)"
--    suffix so Jan-Jun product_ids ("B23332-DAPGREY (deleted)") can look up
--    the class from Jul-Aug records ("B23332-DAPGREY" → ISLAMORA → SW).
--    Also strips "Drop Ship:DS-" prefix so drop-ship lines resolve correctly.
--
-- 2. resolve_invoice_sales_category extended:
--    a. SUNHAVEN → FINNLOU  (Sun Haven dining line, FL-prefixed products)
--    b. Prefix fallback (only when class is NULL after lookup):
--         FL-* / C:FL-* → FINNLOU
--         LUX-* / C:LUX-* → LUX
--    These are safe: FL- is exclusively the Finn & Louise product-ID prefix;
--    LUX- is exclusively the Lux Lighting product-ID prefix.
--
-- August 2026 reconciliation is unaffected: Jul-Aug rows have product_class
-- populated, so the class lookup is a no-op for them and the resolver path
-- through the existing WHEN clauses is identical.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Update resolver: add SUNHAVEN + product_id prefix fallback
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
  SELECT COALESCE(
    -- Primary: exact class or class-as-product_id match
    CASE UPPER(TRIM(COALESCE(NULLIF(TRIM(p_product_class), ''), p_product_id, '')))

      -- ── Sea Winds ──────────────────────────────────────────────────────────
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

      -- ── Finn & Louise ──────────────────────────────────────────────────────
      WHEN 'CHATMAPL'  THEN 'FINNLOU'
      WHEN 'CHATMIDN'  THEN 'FINNLOU'
      WHEN 'MHVDARK'   THEN 'FINNLOU'
      WHEN 'MHVLIGHT'  THEN 'FINNLOU'
      WHEN 'PTBREEZE'  THEN 'FINNLOU'
      WHEN 'RIOVISTA'  THEN 'FINNLOU'
      WHEN 'SUNHAVEN'  THEN 'FINNLOU'   -- Sun Haven dining line (FL-prefix products)

      -- ── Lux Lighting ───────────────────────────────────────────────────────
      WHEN 'LUXCOAST'  THEN 'LUX'
      WHEN 'LUXTRANS'  THEN 'LUX'
      WHEN 'LUXTRAD'   THEN 'LUX'

      -- ── Cross-brand: FL-* / C:FL-* → FINNLOU, else → SW ───────────────────
      WHEN 'CABBED' THEN
        CASE
          WHEN upper(p_product_id) LIKE 'FL-%'
            OR upper(p_product_id) LIKE 'C:FL-%' THEN 'FINNLOU'
          ELSE 'SW'
        END
      WHEN 'CREDENZA' THEN
        CASE
          WHEN upper(p_product_id) LIKE 'FL-%'
            OR upper(p_product_id) LIKE 'C:FL-%' THEN 'FINNLOU'
          ELSE 'SW'
        END

      -- ── Closeout: brand from product_id prefix ─────────────────────────────
      WHEN 'CLOSEOUT' THEN
        CASE
          WHEN upper(p_product_id) LIKE 'C:LUX%'
            OR upper(p_product_id) LIKE 'LUX%'   THEN 'LUX'
          WHEN upper(p_product_id) LIKE 'C:FL-%'
            OR upper(p_product_id) LIKE 'FL-%'   THEN 'FINNLOU'
          ELSE 'SW'
        END

      -- ── QC adjustments ─────────────────────────────────────────────────────
      WHEN 'QCFACTOR' THEN
        CASE WHEN p_product_id ILIKE '%Lux%' THEN 'LUX' ELSE 'SW' END
      WHEN 'QCFREIGH' THEN
        CASE WHEN p_product_id ILIKE '%Lux%' THEN 'LUX' ELSE 'SW' END
      WHEN 'QCINTERN' THEN 'SW'
      WHEN 'RETURN' THEN
        CASE WHEN p_product_id ILIKE '%Lux%' THEN 'LUX' ELSE 'SW' END

      -- ── Allowances ─────────────────────────────────────────────────────────
      WHEN 'ECOMMALL' THEN 'ALLOW'

    END,

    -- Fallback: product_id prefix patterns.
    -- Only reached when p_product_class is NULL (class map had no entry) AND
    -- the CASE above returned NULL. Safe because FL- and LUX- are exclusive
    -- product-ID namespaces for those brands.
    CASE
      WHEN p_product_class IS NULL
        AND (upper(p_product_id) LIKE 'FL-%' OR upper(p_product_id) LIKE 'C:FL-%')
        THEN 'FINNLOU'
      WHEN p_product_class IS NULL
        AND (upper(p_product_id) LIKE 'LUX-%' OR upper(p_product_id) LIKE 'C:LUX-%')
        THEN 'LUX'
    END
  )
$$;

GRANT EXECUTE ON FUNCTION public.resolve_invoice_sales_category(text, text)
  TO authenticated, anon, service_role;

-- Keep backward-compat wrapper unchanged.
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
-- 2. Rebuild v_portal_invoice_line_facts with class-lookup CTE
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_portal_invoice_line_facts CASCADE;

CREATE VIEW public.v_portal_invoice_line_facts AS
WITH pid_class_map AS (
  -- product_id → product_class from any sync batch that has the class.
  -- Most-recent batch wins (synced_at DESC) in case of conflicts.
  SELECT DISTINCT ON (product_id)
    product_id,
    product_class
  FROM public.portal_acctivate_invoice_lines
  WHERE product_class IS NOT NULL
  ORDER BY product_id, synced_at DESC
),
deduped_pail AS (
  -- Keep only the most-recent sync batch for each logical line (handles
  -- stale-batch duplicates). Multiple rows in the SAME batch (same synced_at)
  -- are all kept, so legitimate multi-unit lines are preserved.
  SELECT * FROM (
    SELECT
      pail.*,
      -- Normalize product_id for class map lookup:
      -- strip "Drop Ship:DS-" prefix, then strip "(deleted)" suffix.
      TRIM(REGEXP_REPLACE(
        REGEXP_REPLACE(pail.product_id, '^Drop Ship:DS-', '', 'i'),
        '\s*\(deleted\)\s*$', '', 'i'
      )) AS product_id_normalized,
      MAX(pail.synced_at) OVER (
        PARTITION BY
          pail.guid_invoice,
          pail.invoice_number,
          pail.invoice_date::date,
          pail.product_id,
          pail.description,
          COALESCE(pail.line_amount::numeric, 0),
          COALESCE(pail.invoice_detail_amount::numeric, 0),
          COALESCE(pail.product_class, ''),
          pail.line_number
      ) AS _max_synced
    FROM public.portal_acctivate_invoice_lines pail
  ) _t
  WHERE _t.synced_at = _t._max_synced
),
raw AS (
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
      -- Pass looked-up class for pre-July rows where pail.product_class is NULL.
      -- Jul-Aug rows already have product_class populated; pcm is a no-op there.
      COALESCE(pail.product_class, pcm.product_class)::text,
      pail.product_id_normalized::text
    )                                                                     AS sales_category,
    COALESCE(id2."Price", 0)::numeric                                     AS price,
    COALESCE(id2."QtyInvoiced", 0)::numeric                               AS qty_invoiced,
    COALESCE(id2."LineDiscountPct", 0)::numeric                           AS line_discount_pct,
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
  JOIN deduped_pail pail
    ON pail.guid_invoice = pai.guid_invoice
    -- Drops draft/stale lines whose pail date doesn't match the invoice header.
    AND pail.invoice_date::date = pai.invoice_date::date
  LEFT JOIN pid_class_map pcm
    ON pcm.product_id = pail.product_id_normalized
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
-- 3. Recreate mv_portal_monthly_invoiced_actuals (dropped by CASCADE above)
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

-- ─────────────────────────────────────────────────────────────────────────────
-- v_portal_dealer_rep_reporting_lines reads from get_portal_invoiced_lines()
-- which queries v_portal_invoice_line_facts directly — no separate update needed.
-- ─────────────────────────────────────────────────────────────────────────────

-- Verification (run manually):
/*
-- Monthly totals from the view:
SELECT
  TO_CHAR(invoice_date, 'YYYY-MM') AS month,
  display_category,
  ROUND(SUM(net_invoice_amount), 2) AS total
FROM public.v_portal_invoice_line_facts
WHERE invoice_date >= '2026-01-01'
GROUP BY 1, 2
ORDER BY 1, 2;

-- Monthly totals from the mat view:
SELECT year, month_number, ROUND(invoiced_actual, 2) AS invoiced_actual
FROM public.mv_portal_monthly_invoiced_actuals
WHERE year = 2026
ORDER BY month_number;

-- Aug 2026 MTD cross-check (must match Andrew's spreadsheet):
SELECT display_category, ROUND(SUM(net_invoice_amount), 2) AS total
FROM public.v_portal_invoice_line_facts
WHERE invoice_date >= '2026-08-01'
GROUP BY display_category
ORDER BY total DESC;
-- Expected:
--   Sea Winds     137,917.73
--   Finn & Louise  96,095.16
--   Lux Lighting   13,278.61
--   MISC             -200.88
*/
