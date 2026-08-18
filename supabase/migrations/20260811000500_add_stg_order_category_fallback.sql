-- Add stg_acctivate_order_lines_backfill as a third-tier category lookup.
--
-- Remaining gap after migration 000400: some historical product_ids (RTG-*,
-- discontinued B-prefix items, "Special Order - SW", etc.) were deleted from
-- Acctivate before the July/August sync, so they never appear in pid_class_map
-- and the resolver returns NULL for them.
--
-- stg_acctivate_order_lines_backfill (sol) is an Acctivate order-lines export
-- with a `sales_category` column that uses the same values as Andrew's spreadsheet
-- (SW, FINNLOU, LUX, ALLOW, TARIFF, FREIGHTO, MISC).  It covers product_ids
-- that were active when the backfill was exported, including products now deleted.
--
-- Lookup hierarchy (unchanged except for the new third tier):
--   1. pail.product_class (populated for Jul-Aug 2026 rows)
--   2. pid_class_map: strips "(deleted)" from product_id and looks up class from
--      any pail row where product_class IS NOT NULL (covers most Jan-Jun rows)
--   3. FL-/LUX- prefix fallback in the resolver function
--   4. [NEW] sol_map: strips "(deleted)" / "Drop Ship:DS-" from product_id and
--      looks up sales_category from stg_acctivate_order_lines_backfill.  Only
--      fires when tiers 1-3 all return NULL.
--
-- August 2026 reconciliation is unaffected: pail.product_class is populated for
-- Aug rows, so tier 1 resolves them and tiers 2-4 are never reached.

-- ─────────────────────────────────────────────────────────────────────────────
-- Rebuild v_portal_invoice_line_facts with the sol_map fallback
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_portal_invoice_line_facts CASCADE;

CREATE VIEW public.v_portal_invoice_line_facts AS
WITH pid_class_map AS (
  -- Tier-2 class lookup: product_id → product_class from any sync batch that
  -- has the class.  Most-recent batch wins in case of conflicts.
  SELECT DISTINCT ON (product_id)
    product_id,
    product_class
  FROM public.portal_acctivate_invoice_lines
  WHERE product_class IS NOT NULL
  ORDER BY product_id, synced_at DESC
),
sol_map AS (
  -- Tier-4 category lookup: product_id → sales_category from the Acctivate
  -- order-lines backfill.  Only SW/FINNLOU/LUX/ALLOW are retained; TARIFF,
  -- FREIGHTO, and MISC are excluded (same exclusions as Andrew's spreadsheet).
  SELECT DISTINCT ON (product_id)
    product_id,
    sales_category
  FROM public.stg_acctivate_order_lines_backfill
  WHERE sales_category IN ('SW', 'FINNLOU', 'LUX', 'ALLOW')
  ORDER BY product_id
),
deduped_pail AS (
  -- Keep only the most-recent sync batch for each logical line. Multiple rows
  -- in the SAME batch (same synced_at) are all kept, so legitimate multi-unit
  -- lines are preserved.
  SELECT * FROM (
    SELECT
      pail.*,
      -- Normalize product_id for class/category lookups:
      -- strip "Drop Ship:DS-" prefix then "(deleted)" suffix.
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
    -- Category resolution hierarchy (tiers 1-3 via resolver, tier 4 via sol_map):
    COALESCE(
      public.resolve_invoice_sales_category(
        COALESCE(pail.product_class, pcm.product_class)::text,
        pail.product_id_normalized::text
      ),
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
    AND pail.invoice_date::date = pai.invoice_date::date
  LEFT JOIN pid_class_map pcm
    ON pcm.product_id = pail.product_id_normalized
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
-- Recreate mv_portal_monthly_invoiced_actuals (dropped by CASCADE above)
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
-- Verification
-- ─────────────────────────────────────────────────────────────────────────────
/*
-- Monthly totals Jan-Aug 2026 (compare to Andrew's spreadsheet):
SELECT
  TO_CHAR(invoice_date, 'YYYY-MM') AS month,
  display_category,
  ROUND(SUM(net_invoice_amount), 2) AS total
FROM public.v_portal_invoice_line_facts
WHERE invoice_date >= '2026-01-01'
GROUP BY 1, 2
ORDER BY 1, 2;

-- Andrew's targets (Jan-Jul):
--   Jan: 914,219   Feb: 971,487   Mar: 754,309
--   Apr: 698,942   May: 829,739   Jun: 850,693   Jul: 792,496
-- Aug MTD must still match exactly:
--   Sea Winds 137,917.73  Finn & Louise 96,095.16
--   Lux Lighting 13,278.61  MISC -200.88

-- Mat view:
SELECT year, month_number, ROUND(invoiced_actual, 2) AS invoiced_actual
FROM public.mv_portal_monthly_invoiced_actuals
WHERE year = 2026 ORDER BY month_number;
*/
