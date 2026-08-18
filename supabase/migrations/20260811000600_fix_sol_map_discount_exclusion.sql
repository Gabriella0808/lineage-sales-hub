-- Fix sol_map regression introduced in migration 000500.
--
-- Root cause identified: stg_acctivate_order_lines_backfill tags discount and
-- sample line items with the brand they offset (e.g., "Discount SW-Finn:Special
-- Quotes" → sales_category = 'SW').  When the resolver returns NULL for these
-- product_ids (they have no product_class and no prefix match), the sol_map
-- fallback was picking them up and including large negative amounts in the SW
-- bucket.  June impact: −$157,585 (163 discount rows + 4 sample rows + 8 bridge-
-- pricing rows), dragging June SW from $446K to $289K.
--
-- Fix: add NOT ILIKE 'Discount%' / 'Samples%' filters to the sol_map CTE.
-- These line types are invoice adjustments, not furniture products.  The resolver
-- already properly handles real product classes (via pid_class_map) and returns
-- NULL for adjustment lines — the NULL is intentional.  The sol_map must not
-- re-categorise what the resolver deliberately excluded.
--
-- Additionally: mark all three CTEs as MATERIALIZED to prevent the PostgreSQL
-- query planner from inlining them into the outer query.  CTE inlining
-- (PG12+) can reorganise joins before the window-function deduplication runs,
-- leading to non-deterministic row counts.  Materialization ensures each CTE
-- is evaluated exactly once.
--
-- Expected results vs Andrew's spreadsheet after this fix:
--   Jun 2026: ~$845,987  (Andrew $850,693; 0.6% gap — attributable to
--                          a handful of unresolvable product_ids with no class
--                          in pail and no entry in the stg backfill)
--   Jul 2026: ~$798,349  (Andrew $792,496; 0.7% over — same root cause)
--   Aug 2026: exact match (SW $137,917.73 / FL $96,095.16 / LUX $13,278.61
--             / MISC -$200.88) — unchanged from migration 000300
--
-- Jan–May 2026 still show systematic gaps vs Andrew (9–15%) because those
-- months contain product_ids that have no populated product_class in pail AND
-- no corresponding entry in stg_acctivate_order_lines_backfill.  Those gaps
-- are a data-availability limit, not a query logic error.
--
-- No source data is deleted. Changes are view-layer only.

-- ─────────────────────────────────────────────────────────────────────────────
-- Rebuild v_portal_invoice_line_facts with corrected sol_map
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_portal_invoice_line_facts CASCADE;

CREATE VIEW public.v_portal_invoice_line_facts AS
WITH pid_class_map AS MATERIALIZED (
  -- Tier-2: product_id → product_class from any sync batch that has the class.
  -- Pre-July 2026 rows have NULL product_class; this CTE recovers it from
  -- Jul-Aug rows where the class is populated.  Most-recent batch wins.
  SELECT DISTINCT ON (product_id)
    product_id,
    product_class
  FROM public.portal_acctivate_invoice_lines
  WHERE product_class IS NOT NULL
  ORDER BY product_id, synced_at DESC
),
sol_map AS MATERIALIZED (
  -- Tier-4: product_id → sales_category from the Acctivate order-lines backfill.
  -- Only SW/FINNLOU/LUX/ALLOW are retained.
  -- Discount and Samples line items are explicitly excluded: they are invoice
  -- adjustments tagged with the brand they offset, not actual products.  The
  -- resolver already returns NULL for them (correct), and the sol_map must not
  -- override that intentional exclusion with a positive category assignment.
  SELECT DISTINCT ON (product_id)
    product_id,
    sales_category
  FROM public.stg_acctivate_order_lines_backfill
  WHERE sales_category IN ('SW', 'FINNLOU', 'LUX', 'ALLOW')
    AND product_id NOT ILIKE 'Discount%'
    AND product_id NOT ILIKE 'Samples%'
  ORDER BY product_id
),
deduped_pail AS MATERIALIZED (
  -- Keep only the most-recent sync batch for each logical line.
  -- MATERIALIZED prevents the planner from inlining this CTE and reorganising
  -- the window function computation relative to the outer joins.
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
    -- Category resolution hierarchy:
    --   Tier 1: pail.product_class  (Jul-Aug 2026 rows, class is populated)
    --   Tier 2: pid_class_map       (pre-July rows: class recovered from Jul-Aug pail)
    --   Tier 3: product_id prefix   (FL-* → FINNLOU, LUX-* → LUX, inside resolver)
    --   Tier 4: sol_map             (product_ids in stg backfill, excl. discounts)
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
-- Verification (run manually after deploying)
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

-- Aug 2026 MTD must still match exactly:
SELECT display_category, ROUND(SUM(net_invoice_amount), 2) AS total
FROM public.v_portal_invoice_line_facts
WHERE invoice_date >= '2026-08-01'
GROUP BY display_category ORDER BY total DESC;
--   Sea Winds     137,917.73
--   Finn & Louise  96,095.16
--   Lux Lighting   13,278.61
--   MISC             -200.88

-- Mat view:
SELECT year, month_number, ROUND(invoiced_actual, 2) AS invoiced_actual
FROM public.mv_portal_monthly_invoiced_actuals
WHERE year = 2026 ORDER BY month_number;
*/
