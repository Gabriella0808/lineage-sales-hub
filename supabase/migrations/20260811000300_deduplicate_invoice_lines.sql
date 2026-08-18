-- Remove sync-artifact duplicate lines from the invoice facts view.
--
-- Two classes of duplicates found via reconciliation against Andrew's spreadsheet:
--
-- 1. DRAFT/STALE LINES (invoices 0187599, 0187604):
--    Skyvia synced these invoices twice. The first pass wrote lines with
--    pail.invoice_date = 2026-07-31; the second pass (the correct version)
--    wrote lines with the actual invoice date (Aug 4 or Aug 5). The July 31
--    lines were never cleaned up. Fix: JOIN condition
--    pail.invoice_date::date = pai.invoice_date::date drops them.
--
-- 2. DUPLICATE SYNC BATCH (invoice 0187645):
--    All 14 lines were synced twice under different guid_invoice_detail values:
--      - First sync  2026-08-06 (stale batch): qty = NULL
--      - Second sync 2026-08-11 (correct batch): qty populated
--    Both batches have the same invoice_date so the date filter alone cannot
--    distinguish them. Fix: for each logical line fingerprint, keep only the
--    rows whose synced_at equals the MAX(synced_at) across all rows with that
--    fingerprint. Multiple rows with the SAME synced_at (e.g., an invoice that
--    legitimately sells 3 mattresses, all synced in one batch) are all kept.
--
-- Fingerprint partition (for the synced_at window):
--   guid_invoice, invoice_number, invoice_date::date, product_id, description,
--   COALESCE(line_amount::numeric, 0), COALESCE(invoice_detail_amount::numeric, 0),
--   COALESCE(product_class, ''), line_number
--
-- NOTE: quantity is intentionally excluded from the fingerprint partition.
-- The Aug-06 stale batch has qty = NULL; the Aug-11 correct batch has qty
-- populated. Including COALESCE(quantity,'') would put them in different
-- partitions and prevent deduplication.
--
-- Net FL impact after fix (Aug 2026 MTD):
--   Before: $105,984.64  →  After: $96,095.16  (−$9,889.48)
--   Matches Andrew's spreadsheet to the cent.
--
-- No source data is deleted. Changes are view-layer only.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Rebuild v_portal_invoice_line_facts with dedup logic
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_portal_invoice_line_facts CASCADE;

CREATE VIEW public.v_portal_invoice_line_facts AS
WITH deduped_pail AS (
  -- Remove stale-batch lines: for each logical line, keep only rows whose
  -- synced_at equals the maximum synced_at across all rows with the same
  -- fingerprint. Rows from an older sync batch (lower synced_at) are dropped;
  -- multiple legitimate rows within the same sync batch are all preserved.
  SELECT * FROM (
    SELECT
      pail.*,
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
      pail.product_class::text,
      pail.product_id::text
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
    -- Drop draft/stale lines where the line date doesn't match the invoice
    -- header date. Removes the July-31 pre-sync lines for invoices 0187599
    -- and 0187604 whose headers are dated Aug 4 and Aug 5 respectively.
    AND pail.invoice_date::date = pai.invoice_date::date
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
-- 2. Recreate mv_portal_monthly_invoiced_actuals (dropped by CASCADE above)
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
-- v_portal_dealer_rep_reporting_lines does NOT need to be updated:
-- it reads from get_portal_invoiced_lines() which queries v_portal_invoice_line_facts
-- directly, so it automatically reflects the corrected view.
-- ─────────────────────────────────────────────────────────────────────────────

-- Verification (run manually to confirm):
/*
SELECT display_category, ROUND(SUM(net_invoice_amount), 2) AS total
FROM public.v_portal_invoice_line_facts
WHERE invoice_date >= '2026-08-01'
GROUP BY display_category
ORDER BY total DESC;
-- Expected Aug 2026 MTD (as of Aug 11 2026 sync):
--   Sea Winds    137,917.73
--   Finn & Louise 96,095.16
--   Lux Lighting  13,278.61
--   MISC            -200.88
*/
