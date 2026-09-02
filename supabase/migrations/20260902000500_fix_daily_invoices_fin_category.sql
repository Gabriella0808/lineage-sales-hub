-- ══════════════════════════════════════════════════════════════════════════════
-- Fix Daily Invoices card showing FIN as $0.
--
-- Root cause: v_portal_invoice_line_facts.display_category (used by
-- v_companywide_reporting_actuals, which the Daily Invoices card reads from)
-- has a CASE-statement ordering bug:
--
--   WHEN d.product_sales_category IN ('SW', 'FINNLOU') THEN 'Sea Winds'   -- ①
--   WHEN d.product_sales_category = 'FL'                THEN 'Finn & Lou' -- ②
--   WHEN d.product_sales_category = 'FINNLOU'           THEN 'Finn & Lou' -- ③ unreachable
--
-- Branch ① matches FINNLOU first, so every FINNLOU-coded line (which is most
-- of what Acctivate actually writes — 'FL' is rare) is folded into Sea Winds
-- instead of Finn & Lou. The Daily Invoices card then shows FIN = $0 and SW
-- inflated by the misrouted FINNLOU amount.
--
-- Scope: this migration adds a NEW, dedicated view for the Daily Invoices
-- card only. It does NOT touch v_portal_invoice_line_facts,
-- v_companywide_reporting_actuals, mv_portal_monthly_invoiced_actuals, the
-- Acctivate sync scripts, or the Dealer/Rep Reporting RPCs — all of which
-- keep reading the existing (unfixed) display_category mapping until that is
-- addressed separately.
--
-- Source : public.acctivate_invoice_lines_2026_direct (direct pull, not synced)
-- Amount : formula_net_amount
-- Date   : invoice_date
-- Excludes: FREIGHTO, MISC, SALESTAX, TARIFF
--
-- Buckets:
--   SW    : product_sales_category = 'SW'
--   FIN   : product_sales_category IN ('FL', 'FINNLOU')
--   LUX   : upper(product_sales_category) = 'LUX'
--   ALLOW : product_sales_category = 'ALLOW' OR blank/null
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_daily_invoiced_actuals AS
SELECT
  'invoiced'::text                                            AS metric_type,
  d.invoice_date::date                                        AS transaction_date,
  COALESCE(NULLIF(TRIM(d.sales_rep_id), ''), '')               AS rep_id,
  sr.manager_id,
  CASE
    WHEN d.product_sales_category = 'SW'                                THEN 'SW'
    WHEN d.product_sales_category IN ('FL', 'FINNLOU')                  THEN 'FIN'
    WHEN UPPER(d.product_sales_category) = 'LUX'                        THEN 'LUX'
    WHEN d.product_sales_category = 'ALLOW'
      OR COALESCE(d.product_sales_category, '') = ''                    THEN 'ALLOW'
    ELSE 'Other'
  END                                                            AS brand_category,
  COALESCE(d.formula_net_amount, 0)::numeric                    AS amount
FROM public.acctivate_invoice_lines_2026_direct d
LEFT JOIN public.sales_reps sr
  ON LOWER(TRIM(sr.acctivate_id)) = LOWER(TRIM(d.sales_rep_id))
WHERE d.invoice_date IS NOT NULL
  AND COALESCE(d.product_sales_category, '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF');

GRANT SELECT ON public.v_daily_invoiced_actuals TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION — run after applying in Supabase SQL Editor.
-- Replace the date with the invoice date shown on the Daily Invoices card
-- (the card always shows the prior business day).
--
-- SELECT
--   brand_category,
--   COUNT(*)                    AS line_count,
--   ROUND(SUM(amount), 2)       AS total_amount
-- FROM public.v_daily_invoiced_actuals
-- WHERE transaction_date = '2026-09-01'
-- GROUP BY brand_category
-- ORDER BY brand_category;
--
-- Confirm the grand total equals SW + FIN + LUX + ALLOW (+ Other, if any rows
-- fall through the ELSE branch — should normally be zero):
--
-- SELECT ROUND(SUM(amount), 2) AS grand_total
-- FROM public.v_daily_invoiced_actuals
-- WHERE transaction_date = '2026-09-01';
-- ══════════════════════════════════════════════════════════════════════════════
