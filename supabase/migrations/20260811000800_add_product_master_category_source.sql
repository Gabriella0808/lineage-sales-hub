-- Add acctivate_product_master as authoritative tier-2 category source.
--
-- Context: public.acctivate_product_master is now populated directly from
-- Acctivate and contains product_id → sales_category for all products,
-- including inactive and discontinued items that Skyvia's live catalog sync
-- does not preserve.  This closes most of the Jan–May gap vs Andrew's
-- Acctivate spreadsheet: product_ids with no product_class in pail and no
-- entry in stg_acctivate_order_lines_backfill can now be resolved here.
--
-- New category resolution priority:
--   Tier 1:  pail.product_class (Jul-Aug 2026 rows — class populated by Skyvia)
--   Tier 2:  pid_class_map: class recovered from Jul-Aug pail rows
--   Tier 3:  product_id prefix fallback inside resolve_invoice_sales_category
--            (FL-* → FINNLOU, LUX-* → LUX)
--   Tier 4:  [NEW] acctivate_product_master.sales_category — authoritative
--            Acctivate ProductID → SalesCategory including discontinued products
--   Tier 5:  sol_map (stg_acctivate_order_lines_backfill, excl. discounts)
--   →  NULL  if still unknown (row excluded from view)
--
-- All existing constraints preserved:
--   • August duplicate/draft protection (pail.invoice_date::date = pai.invoice_date::date)
--   • invoice_number in SELECT (feeds get_portal_invoiced_lines + Dealer/Rep Reporting)
--   • MATERIALIZED on all three original CTEs
--   • Discount% / Samples% exclusion in sol_map
--   • No source data modified; changes are view-layer only
--
-- After this migration: REFRESH MATERIALIZED VIEW mv_portal_monthly_invoiced_actuals

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drop view (and dependent mat view) then rebuild
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_portal_invoice_line_facts CASCADE;

CREATE VIEW public.v_portal_invoice_line_facts AS
WITH pid_class_map AS MATERIALIZED (
  -- Tier-2: product_id → product_class from any pail sync batch that has the
  -- class.  Pre-July 2026 rows have NULL product_class; this recovers it from
  -- Jul-Aug rows.  Most-recent batch wins.
  SELECT DISTINCT ON (product_id)
    product_id,
    product_class
  FROM public.portal_acctivate_invoice_lines
  WHERE product_class IS NOT NULL
  ORDER BY product_id, synced_at DESC
),
sol_map AS MATERIALIZED (
  -- Tier-5: product_id → sales_category from the Acctivate order-lines
  -- backfill.  Only SW/FINNLOU/LUX/ALLOW are retained.
  -- Discount and Samples line items are explicitly excluded: they are invoice
  -- adjustments tagged with the brand they offset, not products.
  SELECT DISTINCT ON (product_id)
    product_id,
    sales_category
  FROM public.stg_acctivate_order_lines_backfill
  WHERE sales_category IN ('SW', 'FINNLOU', 'LUX', 'ALLOW')
    AND product_id NOT ILIKE 'Discount%'
    AND product_id NOT ILIKE 'Samples%'
  ORDER BY product_id
),
apm_map AS MATERIALIZED (
  -- Tier-4: authoritative Acctivate product master.  Covers active AND
  -- inactive/discontinued products that Skyvia's live catalog sync drops.
  SELECT DISTINCT ON (product_id)
    product_id,
    sales_category
  FROM public.acctivate_product_master
  WHERE sales_category IN ('SW', 'FINNLOU', 'LUX', 'ALLOW')
  ORDER BY product_id
),
deduped_pail AS MATERIALIZED (
  -- Keep only the most-recent sync batch for each logical line.
  -- MATERIALIZED prevents the planner from inlining this CTE and reorganising
  -- the window-function computation relative to the outer joins.
  SELECT * FROM (
    SELECT
      pail.*,
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
    -- Category resolution (tiers 1-3 via resolver, tier 4 via apm, tier 5 via sol):
    COALESCE(
      public.resolve_invoice_sales_category(
        COALESCE(pail.product_class, pcm.product_class)::text,
        pail.product_id_normalized::text
      ),
      CASE WHEN apm.sales_category IN ('SW', 'FINNLOU', 'LUX', 'ALLOW')
           THEN apm.sales_category END,
      CASE WHEN sol.sales_category IN ('SW', 'FINNLOU', 'LUX', 'ALLOW')
           THEN sol.sales_category END
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
    AND pail.invoice_date::date = pai.invoice_date::date   -- Aug duplicate/draft protection
  LEFT JOIN pid_class_map pcm
    ON pcm.product_id = pail.product_id_normalized
  LEFT JOIN apm_map apm
    ON apm.product_id = pail.product_id_normalized
  LEFT JOIN sol_map sol
    ON sol.product_id = pail.product_id_normalized
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
-- Verification (run manually after deploying)
-- ─────────────────────────────────────────────────────────────────────────────
/*
-- Monthly totals Jan-Aug 2026 (compare to Andrew's spreadsheet):
SELECT
  TO_CHAR(invoice_date, 'YYYY-MM') AS month,
  ROUND(SUM(net_invoice_amount), 0) AS total
FROM public.v_portal_invoice_line_facts
WHERE invoice_date >= '2026-01-01'
GROUP BY 1
ORDER BY 1;
-- Andrew's targets:
--   Jan: 914,219   Feb: 971,487   Mar: 754,309   Apr: 698,942
--   May: 829,739   Jun: 850,693   Jul: 792,496

-- Check how many lines apm resolved that the resolver + sol_map could not:
SELECT
  TO_CHAR(invoice_date, 'YYYY-MM') AS month,
  COUNT(*) FILTER (WHERE sales_category IS NOT NULL) AS resolved,
  COUNT(*) AS total_pail_lines
FROM (
  SELECT
    pai.invoice_date::date,
    COALESCE(
      public.resolve_invoice_sales_category(
        COALESCE(pail.product_class, pcm.product_class)::text,
        TRIM(REGEXP_REPLACE(REGEXP_REPLACE(pail.product_id, '^Drop Ship:DS-', '', 'i'), '\s*\(deleted\)\s*$', '', 'i'))
      ),
      apm.sales_category
    ) AS sales_category
  FROM public.portal_acctivate_invoices pai
  JOIN public.portal_acctivate_invoice_lines pail ON pail.guid_invoice = pai.guid_invoice
  LEFT JOIN (SELECT DISTINCT ON (product_id) product_id, product_class FROM public.portal_acctivate_invoice_lines WHERE product_class IS NOT NULL ORDER BY product_id, synced_at DESC) pcm
    ON pcm.product_id = TRIM(REGEXP_REPLACE(REGEXP_REPLACE(pail.product_id, '^Drop Ship:DS-', '', 'i'), '\s*\(deleted\)\s*$', '', 'i'))
  LEFT JOIN public.acctivate_product_master apm
    ON apm.product_id = TRIM(REGEXP_REPLACE(REGEXP_REPLACE(pail.product_id, '^Drop Ship:DS-', '', 'i'), '\s*\(deleted\)\s*$', '', 'i'))
  WHERE pai.invoice_date >= '2026-01-01' AND pai.invoice_date < '2026-08-01'
) x
GROUP BY 1 ORDER BY 1;

-- Aug 2026 must still match exactly:
SELECT display_category, ROUND(SUM(net_invoice_amount), 2) AS total
FROM public.v_portal_invoice_line_facts
WHERE invoice_date >= '2026-08-01'
GROUP BY display_category ORDER BY total DESC;
--   Sea Winds     137,917.73
--   Finn & Louise  96,095.16
--   Lux Lighting   13,278.61
--   MISC             -200.88

-- Confirm Dealer/Rep Reporting still has invoice_number:
SELECT metric_type, COUNT(*) AS lines, COUNT(invoice_number) AS with_invoice_number
FROM public.v_portal_dealer_rep_reporting_lines
WHERE transaction_date >= '2026-01-01' AND transaction_date < '2026-08-01'
  AND metric_type = 'invoiced'
GROUP BY 1;
*/
