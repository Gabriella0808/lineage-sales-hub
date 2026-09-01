-- ══════════════════════════════════════════════════════════════════════════════
-- Fix: DIRECT branch must map to 'container', not 'pending_business_confirmation'.
--
-- Root cause: an earlier version of 20260902000100 created the fulfillment_type
-- generated column on acctivate_invoice_lines_2026_direct with
--   WHEN 'DIRECT' THEN 'pending_business_confirmation'
-- That mapping was baked into every existing row. Subsequent edits to the
-- migration file did not affect the already-applied column definition.
--
-- Fix: DROP the generated column and ADD it back with the confirmed mapping.
-- Also recreate v_invoice_lines_2026_classified and mv_portal_monthly_invoiced_actuals
-- so all layers are consistent.
--
-- Confirmed business mapping:
--   MIXED   → container
--   DIRECT  → container   ← this is the fix
--   WHSALES → warehouse
--   blank/null → unclassified
--
-- Jan–Jun 2026 invoices: Invoice.BranchID and linked Order.BranchID are blank in
-- Acctivate at source (confirmed SSMS). Those months stay 'unclassified'.
--
-- Does NOT change invoice totals, booking totals, or any dealer/rep reporting.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Fix fulfillment_type on acctivate_invoice_lines_2026_direct ───────────
--
-- Must DROP before re-ADD — PostgreSQL does not support altering a generated
-- column expression in place.

ALTER TABLE public.acctivate_invoice_lines_2026_direct
  DROP COLUMN IF EXISTS fulfillment_type;

ALTER TABLE public.acctivate_invoice_lines_2026_direct
  ADD COLUMN fulfillment_type text
  GENERATED ALWAYS AS (
    CASE UPPER(COALESCE(branch_id, ''))
      WHEN 'MIXED'   THEN 'container'
      WHEN 'DIRECT'  THEN 'container'
      WHEN 'WHSALES' THEN 'warehouse'
      ELSE                'unclassified'
    END
  ) STORED;

-- ─── 2. Recreate v_invoice_lines_2026_classified ──────────────────────────────
--
-- The view computes fulfillment_type independently from the table column,
-- applying the same three-tier fallback (invoice branch → order branch → bos).
-- Using CREATE OR REPLACE preserves existing grants.

CREATE OR REPLACE VIEW public.v_invoice_lines_2026_classified AS
SELECT
  d.invoice_date,
  d.invoice_number,
  d.order_number,
  d.customer_id,
  d.product_sales_category,
  d.formula_net_amount,
  d.branch_id                                                                    AS invoice_branch_id,
  COALESCE(
    NULLIF(TRIM(COALESCE(d.branch_id,   '')), ''),
    NULLIF(TRIM(COALESCE(pao.branch_id, '')), ''),
    NULLIF(TRIM(COALESCE(bos.branch_id, '')), '')
  )                                                                               AS resolved_branch_id,
  CASE UPPER(COALESCE(
    NULLIF(TRIM(COALESCE(d.branch_id,   '')), ''),
    NULLIF(TRIM(COALESCE(pao.branch_id, '')), ''),
    NULLIF(TRIM(COALESCE(bos.branch_id, '')), ''),
    ''
  ))
    WHEN 'MIXED'   THEN 'container'
    WHEN 'DIRECT'  THEN 'container'
    WHEN 'WHSALES' THEN 'warehouse'
    ELSE                'unclassified'
  END                                                                             AS fulfillment_type
FROM public.acctivate_invoice_lines_2026_direct d
LEFT JOIN public.portal_acctivate_orders pao
  ON pao.order_number = d.order_number
 AND d.order_number IS NOT NULL
LEFT JOIN public.booking_orders_sync bos
  ON bos.guid_order::text = pao.guid_order
 AND pao.guid_order IS NOT NULL;

GRANT SELECT ON public.v_invoice_lines_2026_classified TO anon, authenticated;

-- ─── 3. Rebuild mv_portal_monthly_invoiced_actuals ───────────────────────────

DROP MATERIALIZED VIEW IF EXISTS public.mv_portal_monthly_invoiced_actuals;

CREATE MATERIALIZED VIEW public.mv_portal_monthly_invoiced_actuals AS
SELECT
  EXTRACT(YEAR  FROM v.invoice_date)::int                        AS year,
  EXTRACT(MONTH FROM v.invoice_date)::int                        AS month_number,
  COALESCE(SUM(COALESCE(v.formula_net_amount, 0)::numeric), 0)   AS invoiced_actual,
  COALESCE(SUM(
    CASE WHEN v.fulfillment_type = 'container'
    THEN COALESCE(v.formula_net_amount, 0)::numeric ELSE 0 END
  ), 0)                                                           AS invoiced_container,
  COALESCE(SUM(
    CASE WHEN v.fulfillment_type = 'warehouse'
    THEN COALESCE(v.formula_net_amount, 0)::numeric ELSE 0 END
  ), 0)                                                           AS invoiced_warehouse,
  COALESCE(SUM(
    CASE WHEN v.fulfillment_type NOT IN ('container', 'warehouse')
    THEN COALESCE(v.formula_net_amount, 0)::numeric ELSE 0 END
  ), 0)                                                           AS invoiced_unclassified,
  COUNT(DISTINCT v.invoice_number)::int                           AS invoice_count
FROM public.v_invoice_lines_2026_classified v
WHERE v.invoice_date IS NOT NULL
  AND v.invoice_date >= '2026-01-01'
  AND COALESCE(v.product_sales_category, '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF')
GROUP BY
  EXTRACT(YEAR  FROM v.invoice_date),
  EXTRACT(MONTH FROM v.invoice_date)
ORDER BY 1, 2
WITH DATA;

CREATE UNIQUE INDEX ON public.mv_portal_monthly_invoiced_actuals (year, month_number);

GRANT SELECT ON public.mv_portal_monthly_invoiced_actuals
  TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.refresh_mv_portal_invoiced()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_portal_monthly_invoiced_actuals;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_mv_portal_invoiced() TO service_role;

-- ─── 4. Refresh ──────────────────────────────────────────────────────────────

SELECT public.refresh_mv_portal_invoiced();

NOTIFY pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION — run after applying in Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════════════════

-- A. Confirm fulfillment_type on the table (both MIXED and DIRECT should show 'container'):
-- SELECT branch_id, fulfillment_type, COUNT(*), ROUND(SUM(formula_net_amount),2) AS total
-- FROM public.acctivate_invoice_lines_2026_direct
-- WHERE EXTRACT(YEAR FROM invoice_date) = 2026
--   AND COALESCE(product_sales_category,'') NOT IN ('FREIGHTO','MISC','SALESTAX','TARIFF')
-- GROUP BY branch_id, fulfillment_type
-- ORDER BY branch_id;
-- Expected: MIXED → container, DIRECT → container, WHSALES → warehouse, blank → unclassified

-- B. User's requested validation query (DIRECT now counted as container):
-- SELECT
--   extract(month from invoice_date)::int as month_number,
--   round(sum(formula_net_amount), 2) as total_invoiced,
--   round(sum(case when fulfillment_type = 'container'     then formula_net_amount else 0 end), 2) as container_invoiced,
--   round(sum(case when fulfillment_type = 'warehouse'     then formula_net_amount else 0 end), 2) as warehouse_invoiced,
--   round(sum(case when fulfillment_type = 'unclassified'  then formula_net_amount else 0 end), 2) as unclassified_invoiced
-- FROM public.acctivate_invoice_lines_2026_direct
-- WHERE invoice_date >= '2026-01-01'
--   AND invoice_date < '2027-01-01'
--   AND coalesce(product_sales_category, '') not in ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF')
-- GROUP BY 1 ORDER BY 1;
-- Expected July  container ≈ 164,775 (96,752 MIXED + 68,024 DIRECT)
-- Expected August container ≈ 344,438 (33,783 MIXED + 310,655 DIRECT)

-- C. MV spot-check matches table query:
-- SELECT year, month_number,
--   round(invoiced_actual, 2)       AS total,
--   round(invoiced_container, 2)    AS container,
--   round(invoiced_warehouse, 2)    AS warehouse,
--   round(invoiced_unclassified, 2) AS unclassified
-- FROM public.mv_portal_monthly_invoiced_actuals
-- WHERE year = 2026 ORDER BY month_number;
