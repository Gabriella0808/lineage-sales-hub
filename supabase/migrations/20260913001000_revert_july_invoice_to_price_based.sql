-- ══════════════════════════════════════════════════════════════════════════════
-- Revert the July _OriginalPrice invoice override (20260913000700/000800).
-- Diagnostic reconciliation confirmed it was wrong: Andrew's own July
-- invoiced spreadsheet total ($793,244.85) matches the plain Price-based
-- formula_net_amount with his exact exclude-list (FREIGHTO, MISC, SALESTAX,
-- TARIFF) exactly to the penny. The _OriginalPrice-based formula undershoots
-- it by ~$103,601 ($699,737.24) — switching to it was a misdirected fix.
--
-- APPROVED LOGIC (July 2026 invoiced only):
--   amount  = formula_net_amount (Price-based, unchanged column, no _OriginalPrice)
--   exclude = product_sales_category IN ('FREIGHTO','MISC','SALESTAX','TARIFF')
--
-- Three views touched, same three from 20260913000700/000800:
--
-- 1. v_portal_invoice_line_facts (Live KPI / Dealer Reporting / Rep Reporting):
--    - net_invoice_amount: drop the July CASE entirely, back to plain
--      COALESCE(formula_net_amount, 0) for every row, every month.
--    - WHERE clause: this view's category filter was ALREADY wrong before
--      the July work ever started — a whitelist (NULL/SW/ALLOW/FL/FINNLOU/LUX)
--      instead of Andrew's exclude-list, which silently dropped blank-string
--      category rows the exclude-list would keep. Fixing that for ALL months
--      would touch August onwards, which is explicitly out of scope here — so
--      the WHERE clause is now month-scoped: July 2026 uses Andrew's exact
--      exclude-list, every other month (including August+) keeps the exact
--      original whitelist condition, byte-for-byte unchanged.
--
-- 2. v_daily_invoiced_actuals (Daily Invoices): amount reverted to plain
--    COALESCE(formula_net_amount, 0). Its WHERE clause already used Andrew's
--    exclude-list for every month (it was never the buggy whitelist), so it
--    needs no month-scoping change.
--
-- 3. v_invoice_lines_2026_classified (feeds mv_portal_monthly_invoiced_actuals
--    / Monthly Results): formula_net_amount reverted to a plain passthrough
--    of the raw column. The MV's own WHERE clause already applies Andrew's
--    exclude-list for every month, so no change needed there either.
--    Materialized view dropped/recreated on top (required — MVs can't be
--    CREATE OR REPLACE'd), index and grants restored exactly.
--
-- NOT dropped: the original_price column on acctivate_invoice_lines_2026_direct
-- and its backfilled July values, and the backfill_july_2026_invoice_original_price
-- RPC. Nothing currently reads them for invoiced amounts anymore, but they
-- are not source data and removing them isn't necessary for this fix — kept
-- in place for reversibility.
--
-- Untouched: bookings (any table/view/formula), Open SO/backlog, Labor Day
-- Promo, get_portal_invoiced_lines()'s Jan-Jun exclusion, dealers/roster
-- logic, August 2026 onwards invoiced (structurally guaranteed unchanged by
-- the month-scoped WHERE clause above).
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
    COALESCE(d.formula_net_amount, 0::numeric) AS net_invoice_amount,
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
    COALESCE(d.formula_net_amount, 0::numeric) AS amount
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
    d.formula_net_amount,
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

-- ── mv_portal_monthly_invoiced_actuals: rebuild on top of the reverted view ───
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
-- 1. July invoiced total must now be $793,244.85:
--    SELECT round(sum(amount),2) FROM v_portal_dealer_rep_reporting_lines
--    WHERE metric_type='invoiced' AND transaction_date >= '2026-07-01' AND transaction_date < '2026-08-01';
--
-- 2. August+ invoiced total must be byte-identical to before this migration.
--
-- 3. Dealer/Rep Reporting invoiced total must equal Live KPI (same source chain).
-- ══════════════════════════════════════════════════════════════════════════════
