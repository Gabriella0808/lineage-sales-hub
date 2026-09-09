-- ══════════════════════════════════════════════════════════════════════════════
-- STEP 1 of the July bookings reconciliation: fix the SalesCategory whitelist
-- on v_portal_bookings_line_facts.
--
-- Diagnostic finding (this session, confirmed against both a live-Acctivate
-- VM export and direct queries against portal_acctivate_order_lines):
-- Andrew's July bookings target reconciles almost exactly ($803,283.70 vs
-- $803,338, off $54.30) when SalesCategory is restricted to NULL/blank,
-- ALLOW, FINNLOU, LUX, SW. The live view instead filtered on:
--   sales_category = ANY (ARRAY['SW','FINNLOU','LUX','HOSP','ALLOW','MISC'])
-- which has two bugs:
--   1. Includes MISC - $11,188.33 of July 2026 non-booking revenue (e.g. a
--      "CC Processing Fee" line) that Andrew's methodology excludes.
--   2. Excludes blank/NULL sales_category - Postgres's `= ANY (array)` never
--      matches NULL, and '' isn't a literal in the array either, so all
--      blank-category rows ($925.24 in July 2026) were silently dropped even
--      though Andrew's query includes them.
--   HOSP has zero matching rows in the live data - dead code, harmless, but
--   removed for correctness/clarity since it's not in Andrew's list.
-- Net effect measured: +$10,263.09 overstatement from this whitelist alone
-- (the confirmed, fixable half of the ~$57.5K gap between the view's current
-- $860,855.85 and the $803,338 target - the other ~$47,309 is a separate,
-- still-open sync-data-volume question, tracked separately, NOT touched by
-- this migration).
--
-- Fix: same blank-as-NULL-sentinel pattern already used for
-- v_portal_invoice_line_facts elsewhere in this project -
-- COALESCE(NULLIF(TRIM(category), ''), 'NULL') = ANY (ARRAY['NULL', ...])
-- - catches both a true NULL and an empty/whitespace string as "no category",
-- matching Andrew's "blank" inclusion exactly.
--
-- Nothing else in the view changes: net_booking_amount formula, line_cancelled
-- filter, JOIN structure, branch_id/fulfillment_type logic, and every other
-- column are copied verbatim from the live definition. This is a WHERE-clause
-- fix only, not a bookings-formula change.
--
-- v_portal_bookings_line_facts is a plain view with two dependents:
--   - v_portal_dealer_rep_reporting_lines (plain view - picks up the change
--     automatically, no action needed)
--   - mv_portal_monthly_net_bookings_actuals (materialized - needs an
--     explicit REFRESH after this CREATE OR REPLACE VIEW, done below)
--
-- Untouched: net_booking_amount formula, invoices, Live KPI invoice logic,
-- Open SO, Labor Day Promo, Dealer/Rep roster matching, source/sync tables,
-- sync scripts. This migration only changes which SalesCategory values are
-- included in bookings - not how a booking's dollar amount is calculated.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_portal_bookings_line_facts AS
SELECT o.guid_order,
    o.guid_customer,
    o.guid_salesperson,
    date(o.order_date) AS booking_date,
    o.sold_to_name AS dealer_name,
    NULLIF(TRIM(BOTH FROM o.customer_id), ''::text) AS customer_id,
    o.rep1,
    o.rep2,
    l.product_id AS sku,
    l.description,
    CASE l.sales_category
        WHEN 'SW'::text THEN 'Sea Winds'::text
        WHEN 'FINNLOU'::text THEN 'Finn & Lou'::text
        WHEN 'LUX'::text THEN 'Lux'::text
        WHEN 'ALLOW'::text THEN 'MISC'::text
        ELSE l.sales_category
    END AS brand_category,
    CASE
        WHEN COALESCE(NULLIF(l.original_price, ''::text)::numeric, 0::numeric) <> 0::numeric
          THEN COALESCE(l.qty_ordered::numeric, 0::numeric) * NULLIF(l.original_price, ''::text)::numeric * (1.0 - COALESCE(l.line_discount_pct::numeric, 0::numeric) / 100.0)
        ELSE COALESCE(l.amount::numeric, 0::numeric) - COALESCE(l.tariff_amount::numeric, 0::numeric) - COALESCE(l.freight_amount::numeric, 0::numeric)
    END AS net_booking_amount,
    l.product_class,
    l.discount_code,
    COALESCE(NULLIF(TRIM(BOTH FROM COALESCE(o.branch_id, ''::text)), ''::text), NULLIF(TRIM(BOTH FROM COALESCE(bos.branch_id, ''::text)), ''::text)) AS branch_id,
    CASE upper(COALESCE(NULLIF(TRIM(BOTH FROM COALESCE(o.branch_id, ''::text)), ''::text), NULLIF(TRIM(BOTH FROM COALESCE(bos.branch_id, ''::text)), ''::text), ''::text))
        WHEN 'MIXED'::text THEN 'container'::text
        WHEN 'WHSALES'::text THEN 'warehouse'::text
        WHEN 'DIRECT'::text THEN 'container'::text
        ELSE 'unclassified'::text
    END AS fulfillment_type
   FROM portal_acctivate_orders o
     JOIN portal_acctivate_order_lines l ON l.guid_order = o.guid_order
     LEFT JOIN booking_orders_sync bos ON bos.guid_order::text = o.guid_order
  WHERE COALESCE(l.line_cancelled, false) = false
    AND COALESCE(NULLIF(TRIM(BOTH FROM l.sales_category), ''::text), 'NULL'::text) = ANY (ARRAY['NULL'::text, 'ALLOW'::text, 'FINNLOU'::text, 'LUX'::text, 'SW'::text]);

REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_portal_monthly_net_bookings_actuals;

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- 1. July bookings should now be ~$850,592.76 (down from $860,855.85 -
--    MISC $11,188.33 removed, blank/NULL $925.24 added back in, a net
--    $10,263.09 reduction):
--    SELECT round(sum(net_booking_amount),2) FROM v_portal_bookings_line_facts
--    WHERE booking_date >= '2026-07-01' AND booking_date < '2026-08-01';
--    Still
--    still $47,254.76 above the $803,338 target, which is expected: this
--    migration only fixes the confirmed category-whitelist half of the gap.
--    The remaining gap is the separate sync-data-volume question (Step 2,
--    diagnostic only, not fixed here).
--
-- 2. August+ bookings must be re-examined too (this fix is not month-scoped -
--    MISC/HOSP were never a correct inclusion for any month, and blank/NULL
--    was never a correct exclusion for any month). Compare against the
--    pre-migration baseline captured in this session: $1,316,715.97 across
--    2,936 rows for booking_date >= 2026-08-01.
--
-- 3. v_portal_dealer_rep_reporting_lines bookings total must match
--    v_portal_bookings_line_facts exactly (same source, no independent logic).
-- ══════════════════════════════════════════════════════════════════════════════
