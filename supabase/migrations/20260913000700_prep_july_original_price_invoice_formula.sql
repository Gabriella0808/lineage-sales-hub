-- ══════════════════════════════════════════════════════════════════════════════
-- July 2026 invoice formula fix — SCHEMA PREP ONLY, not yet live.
--
-- WHY: during July 2026, tariff/freight were bundled inside the Acctivate
-- invoice line's Price/Amount. From August 2026 onward, Acctivate splits
-- them into separate line items, already excluded by the existing
-- Product.SalesCategory filter. So July invoice amounts computed from
-- formula_net_amount (Price-based) are overstated by the embedded
-- tariff/freight; the correct July formula is:
--   _OriginalPrice * QtyInvoiced * (1 - LineDiscountPct / 100)
--
-- BLOCKER: _OriginalPrice is not available for the vast majority of July.
-- It exists on dbo_InvoiceDetail (the old Skyvia SQL Server mirror), but
-- that mirror died 2026-07-08 — same cutover as dbo_Orders — so it only
-- covers 246 of ~2,755 July invoice lines (July 1-8). It does not exist at
-- all on acctivate_invoice_lines_2026_direct (the table every invoice
-- reporting surface actually reads from) or on portal_acctivate_invoice_lines
-- (the live Acctivate sync table). acctivate_invoice_lines_2026_direct is
-- populated by an external PowerShell/Power Query pipeline (Andrew's,
-- referenced in 20260818000100's comments) that runs outside this
-- repository — not something this session can run or modify.
--
-- SO: this migration only prepares the schema and formula so the fix can go
-- live the moment full-month data is available, without touching any
-- current total:
--   1. Add a nullable original_price column to acctivate_invoice_lines_2026_direct.
--   2. Wire the July formula into every consumer, gated on
--      original_price IS NOT NULL — since that column is 100% NULL right
--      now, every one of these CASE expressions falls through to the
--      existing ELSE branch (COALESCE(formula_net_amount, 0)) for every
--      row, so today's totals are byte-for-byte unchanged. Confirmed by
--      the validation queries below.
--   3. Once Andrew provides a full-July original_price backfill (via
--      UPDATE acctivate_invoice_lines_2026_direct SET original_price = ...
--      WHERE guid_invoice_detail = ..., keyed the same way the direct sync
--      already keys rows), the formula activates automatically — no further
--      migration needed for that part.
--
-- SCOPE OF THIS PASS — covers 3 of the 5 requested surfaces automatically,
-- because they share this one underlying table/view chain:
--   - Live KPI            (reads v_companywide_reporting_actuals, which is
--                           built on v_portal_dealer_rep_reporting_lines ->
--                           get_portal_invoiced_lines() -> this view)
--   - Dealer Reporting     (same chain, via get_sales_reporting_grouped_rows)
--   - Rep Reporting        (same chain)
--   - Daily Invoices       (v_daily_invoiced_actuals, fixed directly below)
--
-- NOT covered by this pass — flagged, not silently skipped:
--   - Monthly Results table (v_portal_monthly_invoiced_actuals) computes its
--     total from portal_acctivate_invoices.total_amount minus
--     keyword-matched freight/tariff line items — an entirely separate
--     methodology that never touches acctivate_invoice_lines_2026_direct or
--     formula_net_amount at all. Applying the same July fix there needs a
--     distinct change (sourcing July's amount from this table's per-line
--     formula instead of total_amount) — not done here; flagged for a
--     separate, explicit follow-up once you confirm you want it.
--
-- Untouched: get_portal_invoiced_lines() (Jan-Jun exclusion, still
-- '>= 2026-07-01'), bookings, Open SO/backlog, Labor Day Promo, the
-- Product.SalesCategory filter/whitelist on both views, dealers table.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.acctivate_invoice_lines_2026_direct
  ADD COLUMN IF NOT EXISTS original_price numeric;

COMMENT ON COLUMN public.acctivate_invoice_lines_2026_direct.original_price IS
  'Acctivate InvoiceDetail._OriginalPrice, July 2026 lines only — backfilled externally (Andrew/Power Query). NULL = July formula falls back to formula_net_amount. Not used outside July 2026.';

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
        WHEN d.invoice_date >= '2026-07-01'::date AND d.invoice_date < '2026-08-01'::date AND d.original_price IS NOT NULL
        THEN d.original_price * COALESCE(d.qty_invoiced, 0::numeric) * (1 - COALESCE(d.line_discount_pct, 0::numeric) / 100.0)
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
  WHERE d.invoice_date IS NOT NULL AND d.invoice_date >= '2026-01-01'::date AND (COALESCE(d.product_sales_category, 'NULL'::text) = ANY (ARRAY['NULL'::text, 'SW'::text, 'ALLOW'::text, 'FL'::text, 'FINNLOU'::text, 'LUX'::text]));

-- ── v_daily_invoiced_actuals: Daily Invoices (July rows) ──────────────────────
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
        WHEN d.invoice_date >= '2026-07-01'::date AND d.invoice_date < '2026-08-01'::date AND d.original_price IS NOT NULL
        THEN d.original_price * COALESCE(d.qty_invoiced, 0::numeric) * (1 - COALESCE(d.line_discount_pct, 0::numeric) / 100.0)
        ELSE COALESCE(d.formula_net_amount, 0::numeric)
    END AS amount
   FROM acctivate_invoice_lines_2026_direct d
     LEFT JOIN sales_reps sr ON lower(TRIM(BOTH FROM sr.acctivate_id)) = lower(TRIM(BOTH FROM d.sales_rep_id))
  WHERE d.invoice_date IS NOT NULL AND d.invoice_date >= '2026-07-01'::date AND (COALESCE(d.product_sales_category, ''::text) <> ALL (ARRAY['FREIGHTO'::text, 'MISC'::text, 'SALESTAX'::text, 'TARIFF'::text]));

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- 1. Today: original_price is all-NULL, so July total must be byte-identical
--    to formula_net_amount's sum (proves this migration is a no-op today):
--    SELECT
--      round(sum(CASE WHEN invoice_date >= '2026-07-01' AND invoice_date < '2026-08-01'
--                      THEN COALESCE(formula_net_amount,0) END),2) AS july_total_old_formula
--    FROM acctivate_invoice_lines_2026_direct
--    WHERE COALESCE(product_sales_category,'NULL') = ANY(ARRAY['NULL','SW','ALLOW','FL','FINNLOU','LUX']);
--    -- compare to: SELECT round(sum(amount),2) FROM v_portal_dealer_rep_reporting_lines
--    --             WHERE metric_type='invoiced' AND transaction_date >= '2026-07-01' AND transaction_date < '2026-08-01';
--
-- 2. Dealer/Rep Reporting invoiced total == Live KPI (unchanged by this migration):
--    SELECT round(sum(primary_amt),2) FROM get_sales_reporting_grouped_rows(
--      'invoiced','dealer','2020-01-01','2030-12-31',NULL,NULL,NULL,NULL,NULL,NULL,NULL);
--
-- 3. Once original_price is backfilled for July, re-run #1 with original_price
--    in the formula to see the corrected July total take effect automatically
--    across Live KPI, Dealer Reporting, Rep Reporting, and Daily Invoices.
-- ══════════════════════════════════════════════════════════════════════════════
