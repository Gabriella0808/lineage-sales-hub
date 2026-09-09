-- ══════════════════════════════════════════════════════════════════════════════
-- Exclude Jan 1 – Jun 30, 2026 INVOICED actuals from all portal reporting.
-- That window is skewed import/migration-transition data in Acctivate.
--
-- SCOPE: invoices only. Bookings, Open SO/backlog, and Labor Day Promo are
-- structurally untouched — see "why bookings can't be affected" below.
--
-- NO SOURCE DATA IS DELETED. public.v_portal_invoice_line_facts,
-- acctivate_invoice_lines_2026_direct, and every table underneath them keep
-- every Jan–Jun row, queryable directly for audit. Only the two functions/
-- views that feed portal REPORTING are filtered.
--
-- WHY get_portal_invoiced_lines() IS THE RIGHT SINGLE POINT OF FIX:
--   public.v_portal_invoice_line_facts (raw invoice lines, untouched)
--     └─ get_portal_invoiced_lines()                    ← fix applied HERE
--         └─ v_portal_dealer_rep_reporting_lines (invoiced UNION ALL bookings)
--             └─ v_companywide_reporting_actuals
--                 ├─ get_manager_reporting_monthly()     → Live KPI YTD/MTD/monthly
--                 └─ get_sales_reporting_grouped_rows()  → Dealer Reporting, Rep Reporting
--
-- v_portal_dealer_rep_reporting_lines' BOOKINGS branch reads from
-- v_portal_bookings_line_facts directly (confirmed via pg_get_viewdef on the
-- live view before writing this migration) — it never calls
-- get_portal_invoiced_lines() at all. So filtering invoiced dates inside
-- that one function cannot reach bookings by construction, not just by
-- convention. Every one of the validation queries in this migration's
-- comment block (and the ones in the request) query
-- v_portal_dealer_rep_reporting_lines directly and will reflect this fix
-- immediately — no other object needs to change.
--
-- get_portal_invoiced_lines() keeps its exact RETURNS TABLE signature, so
-- CREATE OR REPLACE here does not require dropping/rebuilding anything
-- downstream (confirmed: dependents are functions/views that call it via
-- normal FROM/SELECT, not baked-in column references that would break).
--
-- v_daily_invoiced_actuals (Live KPI's Daily Invoices card) is a SEPARATE,
-- parallel view sourced directly from acctivate_invoice_lines_2026_direct —
-- it does not go through get_portal_invoiced_lines() at all, so it needs
-- the identical cutoff added independently to stay consistent (matters if
-- someone uses the date picker to select a pre-July day).
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_portal_invoiced_lines()
RETURNS TABLE(
  metric_type text, transaction_date date, year integer, month_number integer,
  dealer_name text, customer_id text, rep_name text, rep_id text, sku text,
  description text, brand_category text, product_class text, amount numeric,
  invoice_number text, invoice_type text, fulfillment_type text, discount_code text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    'invoiced'::text                              AS metric_type,
    f.invoice_date                                AS transaction_date,
    EXTRACT(YEAR  FROM f.invoice_date)::int       AS year,
    EXTRACT(MONTH FROM f.invoice_date)::int       AS month_number,
    f.dealer_name,
    f.customer_id,
    f.salesperson_name                            AS rep_name,
    f.salesperson_id                              AS rep_id,
    f.product_id                                  AS sku,
    f.description,
    f.display_category                            AS brand_category,
    f.product_class,
    f.net_invoice_amount                          AS amount,
    f.invoice_number,
    f.invoice_type,
    f.fulfillment_type,
    NULL::text                                    AS discount_code
  FROM public.v_portal_invoice_line_facts f
  WHERE f.invoice_date >= '2026-07-01'
$function$;

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
  AND d.invoice_date >= '2026-07-01'
  AND COALESCE(d.product_sales_category, '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF');

GRANT SELECT ON public.v_daily_invoiced_actuals TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- A. Excluded Jan–Jun invoiced total (should be > 0 — this is what audit
--    still has direct access to, just no longer in reporting totals):
--    SELECT round(sum(amount),2) AS excluded_jan_jun_invoiced
--    FROM public.get_portal_invoiced_lines()  -- pre-fix baseline: query
--      public.v_portal_invoice_line_facts directly instead, since this
--      function itself now excludes the window being measured:
--    SELECT round(sum(net_invoice_amount),2) AS excluded_jan_jun_invoiced
--    FROM public.v_portal_invoice_line_facts
--    WHERE invoice_date >= '2026-01-01' AND invoice_date < '2026-07-01';
--
-- B. Valid invoiced total July onwards (should match pre- and post-fix):
--    SELECT round(sum(amount),2) AS valid_july_onwards_invoiced
--    FROM public.v_portal_dealer_rep_reporting_lines
--    WHERE metric_type = 'invoiced' AND transaction_date >= '2026-07-01';
--
-- C. Bookings unaffected (compare pre/post — must be identical):
--    SELECT round(sum(amount),2) AS bookings_total
--    FROM public.v_portal_dealer_rep_reporting_lines
--    WHERE metric_type = 'bookings';
--
-- D. Dealer Reporting sums only July onwards:
--    SELECT customer_id, dealer_name, round(sum(amount),2) AS valid_invoiced
--    FROM public.v_portal_dealer_rep_reporting_lines
--    WHERE metric_type = 'invoiced' AND transaction_date >= '2026-07-01'
--    GROUP BY customer_id, dealer_name ORDER BY valid_invoiced DESC;
--
-- E. Rep Reporting sums only July onwards:
--    SELECT rep_id, rep_name, round(sum(amount),2) AS valid_invoiced
--    FROM public.v_portal_dealer_rep_reporting_lines
--    WHERE metric_type = 'invoiced' AND transaction_date >= '2026-07-01'
--    GROUP BY rep_id, rep_name ORDER BY valid_invoiced DESC;
--
-- F. No Jan–Jun rows can leak through the shared view at all:
--    SELECT count(*) FROM public.v_portal_dealer_rep_reporting_lines
--    WHERE metric_type = 'invoiced' AND transaction_date < '2026-07-01';
--    -- must be 0
-- ══════════════════════════════════════════════════════════════════════════════
