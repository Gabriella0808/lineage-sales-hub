-- ROLLBACK migration 000800.
--
-- 000800 introduced acctivate_product_master as a tier-4 category source and
-- caused Jan–Jun 2026 to regress significantly (June: -$190K vs Andrew).
-- Root cause hypothesis: acctivate_product_master may only contain live/current
-- products, so discontinued products that DID resolve via pid_class_map or
-- sol_map before are now being assigned a wrong or absent category from apm,
-- overriding the working resolution chain.  The table cannot be trusted as a
-- production category source until proven to cover full historical inventory.
--
-- This migration:
--   1. Restores v_portal_invoice_line_facts to the exact state from 000600
--      (MATERIALIZED pid_class_map / sol_map / deduped_pail, Discount%/Samples%
--      exclusion, August duplicate/draft protection, invoice_number in SELECT).
--   2. Recreates mv_portal_monthly_invoiced_actuals (dropped by CASCADE).
--   3. Creates v_portal_invoice_category_diagnostic — a standalone diagnostic
--      view (NOT used in any production chain) that shows all category sources
--      side by side so the product_master coverage can be evaluated safely.
--
-- No source data is modified.  Changes are view-layer only.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Restore v_portal_invoice_line_facts (identical to migration 000600)
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_portal_invoice_line_facts CASCADE;

CREATE VIEW public.v_portal_invoice_line_facts AS
WITH pid_class_map AS MATERIALIZED (
  -- Tier-2: product_id → product_class from any sync batch that has the class.
  -- Pre-July 2026 rows have NULL product_class; this recovers it from Jul-Aug
  -- rows where the class is populated.  Most-recent batch wins.
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
  -- adjustments tagged with the brand they offset, not actual products.
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
    -- Category resolution (tiers 1-3 via resolver, tier 4 via sol_map):
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
    AND pail.invoice_date::date = pai.invoice_date::date   -- Aug duplicate/draft protection
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
-- 3. Diagnostic view — NOT in production chain
--
-- Shows all four category sources side by side for every Jan–Jul 2026 invoice
-- line, so acctivate_product_master coverage can be evaluated before it is
-- considered for production use.
--
-- Columns:
--   month              — YYYY-MM
--   invoice_number     — invoice reference
--   product_id         — raw product_id from pail (includes "(deleted)" etc.)
--   product_id_norm    — normalized product_id used for joins
--   description        — line description
--   cat_resolver       — result of resolve_invoice_sales_category (tiers 1-3)
--   cat_apm            — acctivate_product_master.sales_category (if any match)
--   cat_sol            — stg_acctivate_order_lines_backfill.sales_category
--   cat_final_000600   — what 000600 logic would choose (resolver → sol)
--   apm_agrees         — TRUE if apm matches cat_final_000600, FALSE if it
--                        conflicts, NULL if apm has no entry for this product
--   net_invoice_amount — line amount
--
-- This view is intentionally verbose.  Run it to understand WHERE the product
-- master diverges from working logic before deciding whether to trust it.
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_portal_invoice_category_diagnostic;

CREATE VIEW public.v_portal_invoice_category_diagnostic AS
WITH pid_class_map AS (
  SELECT DISTINCT ON (product_id) product_id, product_class
  FROM public.portal_acctivate_invoice_lines
  WHERE product_class IS NOT NULL
  ORDER BY product_id, synced_at DESC
),
sol_map AS (
  SELECT DISTINCT ON (product_id) product_id, sales_category
  FROM public.stg_acctivate_order_lines_backfill
  WHERE sales_category IN ('SW', 'FINNLOU', 'LUX', 'ALLOW')
    AND product_id NOT ILIKE 'Discount%'
    AND product_id NOT ILIKE 'Samples%'
  ORDER BY product_id
),
deduped_pail AS (
  SELECT * FROM (
    SELECT
      pail.*,
      TRIM(REGEXP_REPLACE(
        REGEXP_REPLACE(pail.product_id, '^Drop Ship:DS-', '', 'i'),
        '\s*\(deleted\)\s*$', '', 'i'
      )) AS product_id_normalized,
      MAX(pail.synced_at) OVER (
        PARTITION BY
          pail.guid_invoice, pail.invoice_number, pail.invoice_date::date,
          pail.product_id, pail.description,
          COALESCE(pail.line_amount::numeric, 0),
          COALESCE(pail.invoice_detail_amount::numeric, 0),
          COALESCE(pail.product_class, ''), pail.line_number
      ) AS _max_synced
    FROM public.portal_acctivate_invoice_lines pail
  ) _t
  WHERE _t.synced_at = _t._max_synced
)
SELECT
  TO_CHAR(pai.invoice_date, 'YYYY-MM')                                    AS month,
  pai.invoice_number                                                       AS invoice_number,
  pail.product_id                                                          AS product_id,
  pail.product_id_normalized                                               AS product_id_norm,
  pail.description                                                         AS description,
  -- Tier 1-3: resolver (product_class from pail or pid_class_map + prefix fallback)
  public.resolve_invoice_sales_category(
    COALESCE(pail.product_class, pcm.product_class)::text,
    pail.product_id_normalized::text
  )                                                                        AS cat_resolver,
  -- Tier 4 candidate: acctivate_product_master
  CASE WHEN apm.sales_category IN ('SW', 'FINNLOU', 'LUX', 'ALLOW')
       THEN apm.sales_category END                                         AS cat_apm,
  -- Tier 4 (current production): stg order-lines backfill
  CASE WHEN sol.sales_category IN ('SW', 'FINNLOU', 'LUX', 'ALLOW')
       THEN sol.sales_category END                                         AS cat_sol,
  -- What 000600 actually picks (resolver → sol):
  COALESCE(
    public.resolve_invoice_sales_category(
      COALESCE(pail.product_class, pcm.product_class)::text,
      pail.product_id_normalized::text
    ),
    CASE WHEN sol.sales_category IN ('SW', 'FINNLOU', 'LUX', 'ALLOW')
         THEN sol.sales_category END
  )                                                                        AS cat_final_000600,
  -- Does apm agree with or conflict with the 000600 result?
  CASE
    WHEN apm.sales_category IS NULL THEN NULL           -- apm has no entry
    WHEN apm.sales_category NOT IN ('SW','FINNLOU','LUX','ALLOW') THEN NULL  -- apm category out of scope
    WHEN apm.sales_category = COALESCE(
      public.resolve_invoice_sales_category(
        COALESCE(pail.product_class, pcm.product_class)::text,
        pail.product_id_normalized::text
      ),
      CASE WHEN sol.sales_category IN ('SW', 'FINNLOU', 'LUX', 'ALLOW')
           THEN sol.sales_category END
    ) THEN TRUE
    ELSE FALSE
  END                                                                      AS apm_agrees,
  COALESCE(
    NULLIF(pail.line_amount::numeric, 0),
    pail.invoice_detail_amount::numeric,
    0
  )::numeric                                                               AS net_invoice_amount
FROM public.portal_acctivate_invoices pai
JOIN deduped_pail pail
  ON pail.guid_invoice = pai.guid_invoice
  AND pail.invoice_date::date = pai.invoice_date::date
LEFT JOIN pid_class_map pcm
  ON pcm.product_id = pail.product_id_normalized
LEFT JOIN public.acctivate_product_master apm
  ON apm.product_id = pail.product_id_normalized
LEFT JOIN sol_map sol
  ON sol.product_id = pail.product_id_normalized
WHERE pai.invoice_date >= '2026-01-01'
  AND pai.invoice_date <  '2026-08-01';

GRANT SELECT ON public.v_portal_invoice_category_diagnostic TO authenticated, anon, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification queries (run manually after deploying)
-- ─────────────────────────────────────────────────────────────────────────────
/*
-- 1. Monthly reconciliation — should restore 000600 values:
SELECT
  TO_CHAR(invoice_date, 'YYYY-MM') AS month,
  ROUND(SUM(net_invoice_amount), 0) AS total
FROM public.v_portal_invoice_line_facts
WHERE invoice_date >= '2026-01-01'
GROUP BY 1 ORDER BY 1;
-- Expected (000600 baseline):
--   Jan: 777,826   Feb: 829,627   Mar: 684,296
--   Apr: 637,695   May: 725,989   Jun: 845,987   Jul: 798,349

-- 2. Aug must still match exactly:
SELECT display_category, ROUND(SUM(net_invoice_amount), 2) AS total
FROM public.v_portal_invoice_line_facts
WHERE invoice_date >= '2026-08-01'
GROUP BY display_category ORDER BY total DESC;
--   Sea Winds 137,917.73  Finn & Louise 96,095.16
--   Lux Lighting 13,278.61  MISC -200.88

-- 3. APM diagnostic — how often does apm agree vs conflict vs have no entry?
SELECT
  month,
  apm_agrees,
  COUNT(*) AS lines,
  ROUND(SUM(net_invoice_amount), 0) AS amount
FROM public.v_portal_invoice_category_diagnostic
GROUP BY 1, 2 ORDER BY 1, 2;
-- apm_agrees = TRUE  → safe to use apm for these lines
-- apm_agrees = FALSE → apm conflicts with working resolution; do NOT use for these
-- apm_agrees = NULL  → apm has no entry (product not in master, or category out of scope)

-- 4. Lines where apm CONFLICTS with working logic (most important to review):
SELECT month, product_id_norm, description,
       cat_resolver, cat_apm, cat_sol, cat_final_000600,
       ROUND(net_invoice_amount, 2) AS amount
FROM public.v_portal_invoice_category_diagnostic
WHERE apm_agrees = FALSE
ORDER BY month, ABS(net_invoice_amount) DESC
LIMIT 100;

-- 5. Lines where apm would ADD a category that 000600 resolves to NULL
--    (these are the candidates that could safely improve coverage):
SELECT month, product_id_norm, description,
       cat_apm, ROUND(SUM(net_invoice_amount), 0) AS amount, COUNT(*) AS lines
FROM public.v_portal_invoice_category_diagnostic
WHERE cat_final_000600 IS NULL
  AND cat_apm IS NOT NULL
GROUP BY 1, 2, 3, 4
ORDER BY 1, ABS(SUM(net_invoice_amount)) DESC;
*/
