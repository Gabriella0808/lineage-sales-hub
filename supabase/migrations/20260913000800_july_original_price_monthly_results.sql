-- ══════════════════════════════════════════════════════════════════════════════
-- Monthly Results reconciliation with Live KPI / Dealer Reporting / Rep
-- Reporting / Daily Invoices.
--
-- CORRECTION TO PRIOR DIAGNOSIS: the object actually named
-- v_portal_monthly_invoiced_actuals (portal_acctivate_invoices.total_amount
-- minus keyword-matched freight/tariff line items) is NOT what powers the
-- "Monthly Results" UI. Checked src/components/MtdInvoicingCard.tsx and
-- src/hooks/useDealerSalesAggregates.ts directly: both read
-- mv_portal_monthly_invoiced_actuals (a MATERIALIZED view), a completely
-- separate object that already sums formula_net_amount sourced from
-- acctivate_invoice_lines_2026_direct via v_invoice_lines_2026_classified —
-- the exact same canonical table Live KPI / Dealer Reporting / Rep
-- Reporting / Daily Invoices already use. v_portal_monthly_invoiced_actuals
-- itself is a leftover from 20260709 (pre-dates the whole direct-sync
-- rebuild), granted to PostgREST but not queried by any current frontend
-- code — left untouched here since nothing depends on it; flagged in the
-- handoff summary rather than silently dropped.
--
-- So Monthly Results was already on the canonical source — it just wasn't
-- getting the July original_price override wired in migration 20260913000700
-- (which only touched v_portal_invoice_line_facts and
-- v_daily_invoiced_actuals). This migration closes that last gap: applies
-- the identical July CASE formula to v_invoice_lines_2026_classified, then
-- rebuilds the materialized view on top of it (materialized views can't be
-- CREATE OR REPLACE'd — dropped and recreated with the same index/grants).
--
-- Same no-op guarantee as 20260913000700: original_price is still all-NULL
-- today, so every row still falls through to the existing
-- COALESCE(formula_net_amount, 0) — today's Monthly Results totals are
-- unchanged. Once Andrew backfills original_price for July (via
-- scripts/acctivate-sync/backfill-july-invoice-original-price.ps1), this
-- activates automatically on the next materialized-view refresh
-- (refresh_mv_portal_invoiced(), already called by the regular sync scripts
-- and re-run manually as needed) — no further migration required.
--
-- Untouched: bookings, Open SO/backlog, Labor Day Promo, get_portal_invoiced_lines()
-- (Jan-Jun exclusion), formula_net_amount/price/invoice_detail_amount columns,
-- the Product.SalesCategory exclusion filter, refresh_mv_portal_invoiced().
-- ══════════════════════════════════════════════════════════════════════════════

-- ── v_invoice_lines_2026_classified: source view for the Monthly Results MV ──
CREATE OR REPLACE VIEW public.v_invoice_lines_2026_classified AS
SELECT d.invoice_date,
    d.invoice_number,
    d.order_number,
    d.customer_id,
    d.product_sales_category,
    CASE
        WHEN d.invoice_date >= '2026-07-01'::date AND d.invoice_date < '2026-08-01'::date AND d.original_price IS NOT NULL
        THEN d.original_price * COALESCE(d.qty_invoiced, 0::numeric) * (1 - COALESCE(d.line_discount_pct, 0::numeric) / 100.0)
        ELSE d.formula_net_amount
    END AS formula_net_amount,
    d.branch_id AS invoice_branch_id,
    COALESCE(NULLIF(TRIM(BOTH FROM COALESCE(d.branch_id, ''::text)), ''::text), NULLIF(TRIM(BOTH FROM COALESCE(pao.branch_id, ''::text)), ''::text), NULLIF(TRIM(BOTH FROM COALESCE(bos.branch_id, ''::text)), ''::text)) AS resolved_branch_id,
    CASE upper(COALESCE(NULLIF(TRIM(BOTH FROM COALESCE(d.branch_id, ''::text)), ''::text), NULLIF(TRIM(BOTH FROM COALESCE(pao.branch_id, ''::text)), ''::text), NULLIF(TRIM(BOTH FROM COALESCE(bos.branch_id, ''::text)), ''::text), ''::text))
        WHEN 'MIXED'::text THEN 'container'::text
        WHEN 'DIRECT'::text THEN 'container'::text
        WHEN 'WHSALES'::text THEN 'warehouse'::text
        ELSE 'unclassified'::text
    END AS fulfillment_type
   FROM acctivate_invoice_lines_2026_direct d
     LEFT JOIN portal_acctivate_orders pao ON pao.order_number = d.order_number AND d.order_number IS NOT NULL
     LEFT JOIN booking_orders_sync bos ON bos.guid_order::text = pao.guid_order AND pao.guid_order IS NOT NULL;

-- ── mv_portal_monthly_invoiced_actuals: rebuild on top of the fixed view ─────
-- Query body is byte-identical to the current definition (20260818000100 /
-- 20260901000100) — only the upstream formula_net_amount value changes for
-- July rows once original_price is populated.
DROP MATERIALIZED VIEW public.mv_portal_monthly_invoiced_actuals;

CREATE MATERIALIZED VIEW public.mv_portal_monthly_invoiced_actuals AS
SELECT EXTRACT(year FROM invoice_date)::integer AS year,
    EXTRACT(month FROM invoice_date)::integer AS month_number,
    COALESCE(sum(COALESCE(formula_net_amount, 0::numeric)), 0::numeric) AS invoiced_actual,
    COALESCE(sum(
        CASE
            WHEN fulfillment_type = 'container'::text THEN COALESCE(formula_net_amount, 0::numeric)
            ELSE 0::numeric
        END), 0::numeric) AS invoiced_container,
    COALESCE(sum(
        CASE
            WHEN fulfillment_type = 'warehouse'::text THEN COALESCE(formula_net_amount, 0::numeric)
            ELSE 0::numeric
        END), 0::numeric) AS invoiced_warehouse,
    COALESCE(sum(
        CASE
            WHEN fulfillment_type <> ALL (ARRAY['container'::text, 'warehouse'::text]) THEN COALESCE(formula_net_amount, 0::numeric)
            ELSE 0::numeric
        END), 0::numeric) AS invoiced_unclassified,
    count(DISTINCT invoice_number)::integer AS invoice_count
   FROM v_invoice_lines_2026_classified v
  WHERE invoice_date IS NOT NULL AND invoice_date >= '2026-01-01'::date AND (COALESCE(product_sales_category, ''::text) <> ALL (ARRAY['FREIGHTO'::text, 'MISC'::text, 'SALESTAX'::text, 'TARIFF'::text]))
  GROUP BY (EXTRACT(year FROM invoice_date)), (EXTRACT(month FROM invoice_date))
  ORDER BY (EXTRACT(year FROM invoice_date)::integer), (EXTRACT(month FROM invoice_date)::integer)
WITH DATA;

CREATE UNIQUE INDEX mv_portal_monthly_invoiced_actuals_year_month_number_idx
  ON public.mv_portal_monthly_invoiced_actuals USING btree (year, month_number);

GRANT ALL ON public.mv_portal_monthly_invoiced_actuals TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mv_portal_monthly_invoiced_actuals TO skyvia_sync;

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- 1. Today (original_price still NULL): Monthly Results July/August rows
--    must be unchanged from before this migration:
--    SELECT year, month_number, invoiced_actual FROM mv_portal_monthly_invoiced_actuals
--    WHERE year = 2026 AND month_number IN (7,8) ORDER BY month_number;
--
-- 2. Once original_price is backfilled, July total here must match:
--    SELECT round(sum(net_invoice_amount),2) FROM v_portal_invoice_line_facts
--    WHERE invoice_date >= '2026-07-01' AND invoice_date < '2026-08-01';
--
-- 3. And July-onwards total here must match Dealer/Rep Reporting:
--    SELECT round(sum(primary_amt),2) FROM get_sales_reporting_grouped_rows(
--      'invoiced','dealer','2020-01-01','2030-12-31',NULL,NULL,NULL,NULL,NULL,NULL,NULL);
-- ══════════════════════════════════════════════════════════════════════════════
