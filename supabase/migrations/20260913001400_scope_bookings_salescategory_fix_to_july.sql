-- ══════════════════════════════════════════════════════════════════════════════
-- Correction to 20260913001300: the SalesCategory whitelist fix was applied
-- globally, which unintentionally changed August+ bookings
-- ($1,316,715.97 -> $1,282,556.09). That was never approved - Andrew's
-- corrected category list (NULL/blank, ALLOW, FINNLOU, LUX, SW) was
-- diagnosed specifically against his JULY export/methodology. August+ should
-- stay on the prior, previously-approved whitelist until a global change is
-- separately decided.
--
-- This migration makes the category filter month-scoped, using the same
-- pattern already established for v_portal_invoice_line_facts
-- (20260913001000): July 2026 gets Andrew's corrected list, every other
-- month keeps the exact original whitelist byte-for-byte:
--   sales_category = ANY (ARRAY['SW','FINNLOU','LUX','HOSP','ALLOW','MISC'])
-- (blank/NULL excluded for non-July, matching pre-20260913001300 behavior).
--
-- Nothing else changes: net_booking_amount formula, line_cancelled filter,
-- JOIN structure, and every other column are unchanged from both prior
-- versions of this view.
--
-- Untouched: invoices, Open SO, Dealer/Rep roster matching, Labor Day Promo,
-- source/sync tables, sync scripts, the 97-row Step 2 diagnostic (not
-- deleted, excluded, or filtered - still open pending Andrew's fresh July
-- export).
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
    AND (
      (o.order_date >= '2026-07-01'::date AND o.order_date < '2026-08-01'::date
        AND COALESCE(NULLIF(TRIM(BOTH FROM l.sales_category), ''::text), 'NULL'::text) = ANY (ARRAY['NULL'::text, 'ALLOW'::text, 'FINNLOU'::text, 'LUX'::text, 'SW'::text]))
      OR
      (NOT (o.order_date >= '2026-07-01'::date AND o.order_date < '2026-08-01'::date)
        AND l.sales_category = ANY (ARRAY['SW'::text, 'FINNLOU'::text, 'LUX'::text, 'HOSP'::text, 'ALLOW'::text, 'MISC'::text]))
    );

REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_portal_monthly_net_bookings_actuals;

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- 1. July bookings must be back to ~$850,592.77 (unchanged from 20260913001300):
--    SELECT round(sum(net_booking_amount),2) FROM v_portal_bookings_line_facts
--    WHERE booking_date >= '2026-07-01' AND booking_date < '2026-08-01';
--
-- 2. Aug+ bookings must be back to the pre-20260913001300 baseline,
--    $1,316,715.97:
--    SELECT round(sum(net_booking_amount),2) FROM v_portal_bookings_line_facts
--    WHERE booking_date >= '2026-08-01';
--
-- 3. v_portal_dealer_rep_reporting_lines bookings must match
--    v_portal_bookings_line_facts exactly, for both July and Aug+.
--
-- 4. July invoiced must remain ~$695,240.96 (untouched by this migration).
--
-- 5. Jan-Jun invoiced must remain 0 rows (untouched by this migration).
-- ══════════════════════════════════════════════════════════════════════════════
