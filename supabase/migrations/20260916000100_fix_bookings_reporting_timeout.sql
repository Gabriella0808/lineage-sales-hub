-- ══════════════════════════════════════════════════════════════════════════════
-- Fix statement timeouts on Dealer/Rep Reporting bookings queries.
--
-- ROOT CAUSE: get_portal_dealer_rep_reporting_lines() selected from the
-- combined view v_portal_dealer_rep_reporting_lines, which is
-- (bookings branch) UNION ALL (SELECT * FROM get_portal_invoiced_lines()).
-- Postgres cannot prove the function-sourced branch never produces
-- metric_type = 'bookings' rows without executing it, so a bookings-only
-- request (p_metric = 'bookings') was still running the ENTIRE, unfiltered
-- (no date bound — it recomputes all-time invoiced data every call)
-- invoiced calculation, then discarding every row from it. That wasted work,
-- repeated on every paginated page of a bookings fetch, was tipping bookings
-- queries over the database statement timeout while invoiced queries (which
-- only need the cheap-to-prune bookings branch skipped) stayed fast.
--
-- FIX: rewrite the function in PL/pgSQL to branch on p_metric and run ONLY
-- the relevant branch — the bookings-branch SQL and the invoiced-branch SQL
-- below are copied verbatim from `pg_get_viewdef` / `pg_get_functiondef` on
-- the existing, live objects, not re-derived, so no calculation, join,
-- COALESCE, or exclusion logic changes. An ELSE fallback preserves the
-- original combined-view query for any p_metric value other than the two
-- currently used by the app ('bookings' / 'invoiced'), so this is a strict
-- safe superset of the previous behavior, never a narrower one.
--
-- VALIDATED before deploy (see conversation): row-for-row EXCEPT diff
-- between old and new implementations was 0 in both directions, for both
-- metrics, full date range, with and without discount_code filtering.
-- Confirmed timing: 27.6s -> 5.7s for a full-range bookings query.
--
-- v_portal_dealer_rep_reporting_lines, get_portal_invoiced_lines(), and
-- v_portal_bookings_line_facts are all left completely untouched.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_portal_dealer_rep_reporting_lines(p_metric text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_discount_code text DEFAULT NULL::text, p_limit integer DEFAULT 1000, p_offset integer DEFAULT 0)
 RETURNS TABLE(metric_type text, transaction_date date, year integer, month_number integer, dealer_name text, customer_id text, rep_name text, rep_id text, sku text, description text, brand_category text, product_class text, amount numeric, invoice_number text, fulfillment_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rep_ids text[];
BEGIN
  SELECT CASE
    WHEN public.is_admin() OR public.current_manager_id() IS NOT NULL THEN NULL::text[]
    WHEN public.current_rep_acctivate_ids() IS NOT NULL THEN public.current_rep_acctivate_ids()
    ELSE ARRAY['__no_rep_mapped__']
  END INTO v_rep_ids;

  IF p_metric = 'bookings' THEN
    RETURN QUERY
    WITH order_salesperson_lookup AS (
            SELECT TRIM(BOTH '{}'::text FROM lower((o."GUIDSalesperson")::text)) AS guid_salesperson_norm,
               max(NULLIF(TRIM(BOTH FROM (o."SalespersonID")::text), ''::text)) AS salesperson_id,
               max(NULLIF(TRIM(BOTH FROM (o."SalespersonName")::text), ''::text)) AS salesperson_name
              FROM "dbo_Orders" o
             WHERE (o."GUIDSalesperson" IS NOT NULL)
             GROUP BY (TRIM(BOTH '{}'::text FROM lower((o."GUIDSalesperson")::text)))
          ), customer_lookup AS (
           SELECT lower((o."GUIDCustomer")::text) AS guid_customer_norm,
              max(NULLIF(TRIM(BOTH FROM (o."CustomerID")::text), ''::text)) AS customer_id
             FROM "dbo_Orders" o
            WHERE (o."GUIDCustomer" IS NOT NULL)
            GROUP BY (lower((o."GUIDCustomer")::text))
          ), unique_dealer_name_lookup AS (
           SELECT lower(TRIM(BOTH FROM dealers.name)) AS name_norm,
              min(dealers.acctivate_id) AS acctivate_id
             FROM dealers
            GROUP BY (lower(TRIM(BOTH FROM dealers.name)))
           HAVING (count(*) = 1)
          ), a AS (
     SELECT 'bookings'::text AS metric_type,
        f.booking_date AS transaction_date,
        (EXTRACT(year FROM f.booking_date))::integer AS year,
        (EXTRACT(month FROM f.booking_date))::integer AS month_number,
        COALESCE(f.dealer_name, (o."CustomerID")::text, cl.customer_id, udl.acctivate_id) AS dealer_name,
        COALESCE(f.customer_id, (o."CustomerID")::text, cl.customer_id, udl.acctivate_id) AS customer_id,
        COALESCE(osl.salesperson_name, NULLIF((o."SalespersonName")::text, ''::text), NULLIF((o."_Rep1")::text, ''::text), NULLIF((o."_Rep2")::text, ''::text), NULLIF(f.rep1, ''::text), NULLIF(f.rep2, ''::text), 'Unassigned'::text) AS rep_name,
        COALESCE(NULLIF(osl.salesperson_id, ''::text), NULLIF(f.rep1, ''::text), f.guid_salesperson) AS rep_id,
        f.sku,
        f.description,
        f.brand_category,
        f.product_class,
        f.net_booking_amount AS amount,
        NULL::text AS invoice_number,
        NULL::text AS invoice_type,
        f.fulfillment_type,
        f.discount_code
       FROM ((((v_portal_bookings_line_facts f
         LEFT JOIN "dbo_Orders" o ON ((TRIM(BOTH '{}'::text FROM lower((o."GUIDOrder")::text)) = lower(f.guid_order))))
         LEFT JOIN order_salesperson_lookup osl ON ((osl.guid_salesperson_norm = TRIM(BOTH '{}'::text FROM lower(f.guid_salesperson)))))
         LEFT JOIN customer_lookup cl ON ((cl.guid_customer_norm = lower(f.guid_customer))))
         LEFT JOIN unique_dealer_name_lookup udl ON ((udl.name_norm = lower(TRIM(BOTH FROM f.dealer_name)))))
      WHERE (f.booking_date IS NOT NULL)
    )
    SELECT a.metric_type, a.transaction_date, a.year, a.month_number,
           a.dealer_name, a.customer_id, a.rep_name, a.rep_id,
           a.sku, a.description, a.brand_category, a.product_class,
           a.amount, a.invoice_number, a.fulfillment_type
    FROM a
    WHERE (p_from IS NULL OR a.transaction_date >= p_from)
      AND (p_to   IS NULL OR a.transaction_date <  p_to)
      AND (p_discount_code IS NULL OR a.discount_code = p_discount_code)
      AND (v_rep_ids IS NULL
           OR (NULLIF(TRIM(a.rep_id), '') IS NOT NULL AND lower(TRIM(a.rep_id)) = ANY(v_rep_ids)))
    ORDER BY a.transaction_date
    LIMIT p_limit OFFSET p_offset;

  ELSIF p_metric = 'invoiced' THEN
    RETURN QUERY
    SELECT a.metric_type, a.transaction_date, a.year, a.month_number,
           a.dealer_name, a.customer_id, a.rep_name, a.rep_id,
           a.sku, a.description, a.brand_category, a.product_class,
           a.amount, a.invoice_number, a.fulfillment_type
    FROM public.get_portal_invoiced_lines() a
    WHERE (p_from IS NULL OR a.transaction_date >= p_from)
      AND (p_to   IS NULL OR a.transaction_date <  p_to)
      AND (p_discount_code IS NULL OR a.discount_code = p_discount_code)
      AND (v_rep_ids IS NULL
           OR (NULLIF(TRIM(a.rep_id), '') IS NOT NULL AND lower(TRIM(a.rep_id)) = ANY(v_rep_ids)))
    ORDER BY a.transaction_date
    LIMIT p_limit OFFSET p_offset;

  ELSE
    -- Fallback for any p_metric other than 'bookings'/'invoiced' (not used
    -- by the app today) — preserves the exact original combined-view
    -- behavior so this stays a safe superset of the old function.
    RETURN QUERY
    SELECT a.metric_type, a.transaction_date, a.year, a.month_number,
           a.dealer_name, a.customer_id, a.rep_name, a.rep_id,
           a.sku, a.description, a.brand_category, a.product_class,
           a.amount, a.invoice_number, a.fulfillment_type
    FROM public.v_portal_dealer_rep_reporting_lines a
    WHERE a.metric_type = p_metric
      AND (p_from IS NULL OR a.transaction_date >= p_from)
      AND (p_to   IS NULL OR a.transaction_date <  p_to)
      AND (p_discount_code IS NULL OR a.discount_code = p_discount_code)
      AND (v_rep_ids IS NULL
           OR (NULLIF(TRIM(a.rep_id), '') IS NOT NULL AND lower(TRIM(a.rep_id)) = ANY(v_rep_ids)))
    ORDER BY a.transaction_date
    LIMIT p_limit OFFSET p_offset;
  END IF;
END;
$function$;

DROP FUNCTION IF EXISTS public.get_portal_dealer_rep_reporting_lines_v2_test(text, date, date, text, integer, integer);
