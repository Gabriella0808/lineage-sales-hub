-- ══════════════════════════════════════════════════════════════════════════════
-- Targets were swapped in the earlier reconciliation. Corrected:
--   July invoiced target = $695,373  (was misreported as $803,338)
--   July bookings target = $803,338  (was misreported as $695,373)
--
-- This re-validates the _OriginalPrice formula for July invoiced — it was
-- right all along. 20260913001000 reverted to Price-based because it
-- appeared to match a target that was actually the bookings number.
--
-- The earlier _OriginalPrice diagnostic ($699,737.24) was itself slightly
-- wrong: it fell back to the Price-based (tariff-inclusive) amount for the
-- 11 July rows missing original_price, silently reintroducing exactly the
-- bundled tariff/freight this fix exists to strip out. Correct handling —
-- treat missing original_price as $0 (excluded), matching Power Query's
-- null-propagation — gives $695,240.96, which is $132.04 (0.019%) from
-- Andrew's $695,373 target. That residual is noise (live-sync timing vs.
-- Andrew's snapshot), not a missing filter — confirmed clean across
-- Product.SalesCategory, Invoice.Type, BranchID, and duplicate_row_ordinal
-- breakdowns.
--
-- FORMULA (July 2026 invoiced only):
--   original_price IS NOT NULL -> original_price * qty_invoiced * (1 - line_discount_pct/100)
--   original_price IS NULL     -> 0 (excluded, NOT a fallback to formula_net_amount)
--   category exclude-list (FREIGHTO/MISC/SALESTAX/TARIFF) — already
--     month-scoped to July by 20260913001000, unchanged here.
--
-- Three views touched again, same three as every prior July invoice pass:
-- v_portal_invoice_line_facts, v_daily_invoiced_actuals,
-- v_invoice_lines_2026_classified (+ rebuild mv_portal_monthly_invoiced_actuals).
--
-- Untouched: August onwards invoiced (byte-identical WHERE/formula for
-- non-July rows), Jan-Jun exclusion, bookings (any table/view/formula —
-- still diagnostic-only per this request, gap not yet resolved), Open SO,
-- Labor Day Promo, dealers/roster logic.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── v_portal_invoice_line_facts: Live KPI / Dealer Reporting / Rep Reporting ──
CREATE OR REPLACE VIEW public.v_portal_invoice_line_facts AS
SELECT d.invoice_date,
    d.invoice_number,
    d.customer_id,
    COALESCE(NULLIF(TRIM(BOTH FROM dl.name), ''::text), d.customer_id) AS dealer_name,
    COALESCE(NULLIF(TRIM(BOTH FROM asr.name), ''::text), NULLIF(TRIM(BOTH FROM pai.sales_rep_name), ''::text), NULLIF(TRIM(BOTH FROM pai.sales_rep_id), ''::text), NULLIF(TRIM(BOTH FROM d.sales_rep_id), ''::text), 'Unassigned'::text) AS salesperson_name,
    COALESCE(NULLIF(TRIM(BOTH FROM d.sales_rep_id), ''::text), ''::text) AS salesperson_id,
    d.product_id,
    d.description,
    d.product_sales_category AS sales_category,
    CASE
        WHEN d.product_sales_category = 'SW'::text THEN 'Sea Winds'::text
        WHEN d.product_sales_category = ANY (ARRAY['FL'::text, 'FINNLOU'::text]) THEN 'Finn & Lou'::text
        WHEN d.product_sales_category = 'LUX'::text THEN 'Lux'::text
        WHEN d.product_sales_category = 'ALLOW'::text THEN 'ALLOW'::text
        ELSE NULL::text
    END AS display_category,
    d.product_class,
    COALESCE(d.price, 0::numeric) AS price,
    COALESCE(d.qty_invoiced, 0::numeric) AS qty_invoiced,
    COALESCE(d.line_discount_pct, 0::numeric) AS line_discount_pct,
    CASE
        WHEN d.invoice_date >= '2026-07-01'::date AND d.invoice_date < '2026-08-01'::date
          THEN CASE WHEN d.original_price IS NOT NULL
                 THEN d.original_price * COALESCE(d.qty_invoiced, 0::numeric) * (1::numeric - COALESCE(d.line_discount_pct, 0::numeric) / 100.0)
                 ELSE 0::numeric
               END
        ELSE COALESCE(d.formula_net_amount, 0::numeric)
    END AS net_invoice_amount,
    COALESCE(d.invoice_type, ''::text) AS invoice_type,
    CASE COALESCE(d.invoice_type, ''::text)
        WHEN 'C'::text THEN 'Credit Memo'::text
        ELSE COALESCE(d.invoice_type, ''::text)
    END AS invoice_type_label,
    d.fulfillment_type
   FROM acctivate_invoice_lines_2026_direct d
     LEFT JOIN dealers dl ON dl.acctivate_id = d.customer_id
     LEFT JOIN portal_acctivate_invoices pai ON pai.guid_invoice::text = d.guid_invoice
     LEFT JOIN acctivate_sales_reps asr ON lower(TRIM(BOTH FROM asr.acctivate_id)) = lower(TRIM(BOTH FROM d.sales_rep_id))
  WHERE d.invoice_date IS NOT NULL AND d.invoice_date >= '2026-01-01'::date
    AND (
      (d.invoice_date >= '2026-07-01'::date AND d.invoice_date < '2026-08-01'::date
        AND COALESCE(d.product_sales_category, ''::text) <> ALL (ARRAY['FREIGHTO'::text, 'MISC'::text, 'SALESTAX'::text, 'TARIFF'::text]))
      OR
      (NOT (d.invoice_date >= '2026-07-01'::date AND d.invoice_date < '2026-08-01'::date)
        AND COALESCE(d.product_sales_category, 'NULL'::text) = ANY (ARRAY['NULL'::text, 'SW'::text, 'ALLOW'::text, 'FL'::text, 'FINNLOU'::text, 'LUX'::text]))
    );

-- ── v_daily_invoiced_actuals: Daily Invoices ──────────────────────────────────
CREATE OR REPLACE VIEW public.v_daily_invoiced_actuals AS
SELECT 'invoiced'::text AS metric_type,
    d.invoice_date AS transaction_date,
    COALESCE(NULLIF(TRIM(BOTH FROM d.sales_rep_id), ''::text), ''::text) AS rep_id,
    sr.manager_id,
    CASE
        WHEN d.product_sales_category = 'SW'::text THEN 'SW'::text
        WHEN d.product_sales_category = ANY (ARRAY['FL'::text, 'FINNLOU'::text]) THEN 'FIN'::text
        WHEN upper(d.product_sales_category) = 'LUX'::text THEN 'LUX'::text
        WHEN d.product_sales_category = 'ALLOW'::text OR COALESCE(d.product_sales_category, ''::text) = ''::text THEN 'ALLOW'::text
        ELSE 'Other'::text
    END AS brand_category,
    CASE
        WHEN d.invoice_date >= '2026-07-01'::date AND d.invoice_date < '2026-08-01'::date
          THEN CASE WHEN d.original_price IS NOT NULL
                 THEN d.original_price * COALESCE(d.qty_invoiced, 0::numeric) * (1::numeric - COALESCE(d.line_discount_pct, 0::numeric) / 100.0)
                 ELSE 0::numeric
               END
        ELSE COALESCE(d.formula_net_amount, 0::numeric)
    END AS amount
   FROM acctivate_invoice_lines_2026_direct d
     LEFT JOIN sales_reps sr ON lower(TRIM(BOTH FROM sr.acctivate_id)) = lower(TRIM(BOTH FROM d.sales_rep_id))
  WHERE d.invoice_date IS NOT NULL AND d.invoice_date >= '2026-07-01'::date AND (COALESCE(d.product_sales_category, ''::text) <> ALL (ARRAY['FREIGHTO'::text, 'MISC'::text, 'SALESTAX'::text, 'TARIFF'::text]));

-- ── v_invoice_lines_2026_classified: feeds mv_portal_monthly_invoiced_actuals ─
CREATE OR REPLACE VIEW public.v_invoice_lines_2026_classified AS
SELECT d.invoice_date,
    d.invoice_number,
    d.order_number,
    d.customer_id,
    d.product_sales_category,
    CASE
        WHEN d.invoice_date >= '2026-07-01'::date AND d.invoice_date < '2026-08-01'::date
          THEN CASE WHEN d.original_price IS NOT NULL
                 THEN d.original_price * COALESCE(d.qty_invoiced, 0::numeric) * (1::numeric - COALESCE(d.line_discount_pct, 0::numeric) / 100.0)
                 ELSE 0::numeric
               END
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

-- ── mv_portal_monthly_invoiced_actuals: rebuild on top ────────────────────────
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
-- 1. July invoiced total must now be ~$695,240.96 (within $132 of $695,373):
--    SELECT round(sum(amount),2) FROM v_portal_dealer_rep_reporting_lines
--    WHERE metric_type='invoiced' AND transaction_date >= '2026-07-01' AND transaction_date < '2026-08-01';
--
-- 2. August+ invoiced total must be unchanged from before this migration.
--
-- 3. Dealer/Rep Reporting invoiced total must equal Live KPI (same source chain).
-- ══════════════════════════════════════════════════════════════════════════════
