-- ══════════════════════════════════════════════════════════════════════════════
-- Fix August/September invoiced mismatch: Dealer/Rep Reporting vs Live KPI.
--
-- ROOT CAUSE: v_portal_invoice_line_facts's non-July branch (introduced by
-- the still-uncommitted 20260913000700_prep_july_original_price_invoice_formula.sql,
-- committed alongside this migration - see below) filters categories with an
-- INCLUDE-list:
--   COALESCE(product_sales_category, 'NULL') = ANY ('NULL','SW','ALLOW','FL','FINNLOU','LUX')
-- COALESCE only substitutes for a true SQL NULL. The real data stores blank
-- category as an empty string (''), not NULL, so COALESCE never fires and ''
-- fails the include-list match - every blank-category invoice line for
-- August/September silently drops out of Dealer Reporting and Rep Reporting.
--
-- Live KPI (mv_portal_monthly_invoiced_actuals, via v_invoice_lines_2026_classified)
-- was never touched by that bug - it uses an EXCLUDE-list
-- (COALESCE(category,'') NOT IN ('FREIGHTO','MISC','SALESTAX','TARIFF')) applied
-- uniformly to every month, so blank category always passes through there.
-- July's own branch in v_portal_invoice_line_facts already uses this same
-- exclude-list, which is why July already matched exactly on both sides.
--
-- Confirmed via live data the dropped rows are real, not noise: 2 credit
-- memos in August (-$10,120.00, -$33,140.00) and 1 in September (-$33,140.00),
-- all Baer's Furniture, product CABBED, same underlying PO761874/SO175650,
-- plus $13,681.24 of legitimate positive-dollar August order lines that also
-- happen to carry a blank category. Net effect: August understated by
-- $29,578.76, September by $33,140.00 in Dealer/Rep Reporting relative to
-- Live KPI - exactly matching the reported gaps.
--
-- FIX: replace the non-July branch's category predicate with the same
-- exclude-list Live KPI and July already use, normalized with NULLIF/TRIM so
-- both blank string and true NULL are treated identically. The July branch's
-- predicate is left completely untouched (same text, same position) per
-- explicit instruction not to change July invoice logic.
--
-- Also committing here (previously live but uncommitted - see prior session
-- turn's flag): 20260913000700_prep_july_original_price_invoice_formula.sql
-- and 20260913000800_july_original_price_monthly_results.sql, both of which
-- are exclusively about this same invoiced-reporting chain (the July
-- original_price formula + wiring it into Monthly Results) and were already
-- applied live; committing them now closes the migration-history gap that
-- this fix builds on top of. NOT committing here: 20260913000600 (bookings
-- customer_id - out of scope, "do not change bookings") or the 20260910 temp/
-- diagnostic files (unrelated, unreviewed) - both left exactly as before,
-- untouched either way.
--
-- Untouched: Jan-Jun exclusion (get_portal_invoiced_lines()'s >= 2026-07-01
-- floor, not modified), bookings, Open SO/backlog, Labor Day Promo, dealer
-- roster, territory logic, source transaction data, mv_portal_monthly_invoiced_actuals
-- and v_invoice_lines_2026_classified (already correct, not modified).
-- ══════════════════════════════════════════════════════════════════════════════

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
        WHEN d.invoice_date >= '2026-07-01'::date AND d.invoice_date < '2026-08-01'::date THEN
        CASE
            WHEN d.original_price IS NOT NULL THEN d.original_price * COALESCE(d.qty_invoiced, 0::numeric) * (1::numeric - COALESCE(d.line_discount_pct, 0::numeric) / 100.0)
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
  WHERE d.invoice_date IS NOT NULL AND d.invoice_date >= '2026-01-01'::date AND (
    (d.invoice_date >= '2026-07-01'::date AND d.invoice_date < '2026-08-01'::date AND (COALESCE(d.product_sales_category, ''::text) <> ALL (ARRAY['FREIGHTO'::text, 'MISC'::text, 'SALESTAX'::text, 'TARIFF'::text])))
    OR
    (NOT (d.invoice_date >= '2026-07-01'::date AND d.invoice_date < '2026-08-01'::date) AND (COALESCE(NULLIF(TRIM(BOTH FROM d.product_sales_category), ''::text), ''::text) <> ALL (ARRAY['FREIGHTO'::text, 'MISC'::text, 'SALESTAX'::text, 'TARIFF'::text])))
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- 1. Dealer/Rep Reporting invoiced now matches Live KPI exactly:
--    SELECT date_trunc('month', transaction_date)::date AS month, round(sum(amount),2)
--    FROM v_portal_dealer_rep_reporting_lines WHERE metric_type = 'invoiced'
--      AND transaction_date >= '2026-07-01' GROUP BY 1 ORDER BY 1;
--    -- expect: Jul 695240.96, Aug 1103971.83, Sep 605012.56
--
-- 2. The 3 Baer's Furniture credit memos are now included:
--    SELECT invoice_number, net_invoice_amount FROM v_portal_invoice_line_facts
--    WHERE customer_id = 'Baer''s Furniture' AND invoice_type = 'C'
--      AND invoice_date >= '2026-08-01';
--    -- expect 3 rows: -10120, -33140, -33140
--
-- 3. July unchanged (695240.96), Jan-Jun still fully excluded (no rows
--    before 2026-07-06), bookings/Open SO/territory/roster untouched (this
--    migration only replaces v_portal_invoice_line_facts's WHERE clause).
-- ══════════════════════════════════════════════════════════════════════════════
