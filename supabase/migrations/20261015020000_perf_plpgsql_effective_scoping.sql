-- Perf fix: "High-Level Reporting" (and siblings) intermittently fail with
-- "canceling statement due to statement timeout".
--
-- Root cause, confirmed via EXPLAIN ANALYZE: these LANGUAGE sql SECURITY
-- DEFINER functions compute their rep/manager scoping via a
-- `WITH effective AS (...)` CTE that references is_admin()/
-- current_manager_id()/current_rep_acctivate_ids() - themselves SECURITY
-- DEFINER functions doing real subqueries. Without an explicit
-- materialization hint, Postgres is free to fold that CTE into the outer
-- query and re-evaluate it once per candidate row instead of once per
-- call - and with ~15-16k candidate rows, that's thousands of redundant
-- SECURITY DEFINER calls per request.
--
-- Measured, before fixing anything (EXPLAIN ANALYZE, same params/data for
-- every pair):
--   get_companywide_actuals_scoped   2,356 ms
--   get_manager_reporting_monthly    6,134 ms
--   get_open_sales_order_lines         133 ms
--   get_open_so_lines_scoped           103 ms
--   get_daily_invoiced_actuals_scoped   27 ms
-- The frontend's fetchAll() pagination fires up to ~16 of these in
-- PARALLEL for a single page load, so the aggregate concurrent load was
-- enough to trip the server's statement_timeout consistently, not just
-- under unusual load - explaining the two slowest functions above being
-- exactly the ones used by the page that was timing out.
--
-- First attempt was adding MATERIALIZED to the CTEs directly - fixed the
-- isolated/inlined query (2,359ms -> 331ms) but made the actual wrapped
-- function call WORSE (2,356ms -> 9,469-9,497ms, reproduced twice) by
-- forcing a different, worse join shape once real parameter binding (not
-- inlined literals) was involved. That attempt was applied, measured bad,
-- and reverted within the same session before this migration - never
-- landed as a committed migration.
--
-- This migration instead converts each function from LANGUAGE sql to
-- LANGUAGE plpgsql, computing the effective rep/manager scoping into a
-- plain variable via `:=` before the main query, then referencing that
-- variable (not a CTE) in the WHERE clause - inherently single-evaluation
-- in plpgsql, and doesn't introduce a CTE optimization fence the way
-- MATERIALIZED did. This is the SAME pattern already used successfully by
-- three sibling functions in this codebase (get_sales_reporting_
-- grouped_rows, get_sales_reporting_detail_lines,
-- get_portal_dealer_rep_reporting_lines - unaffected by this bug for
-- exactly this reason), not a new approach.
--
-- Re-measured after this fix (same params/data, via the real function
-- call, not an inlined substitute):
--   get_companywide_actuals_scoped   2,356 ms -> 167 ms  (14x)
--   get_manager_reporting_monthly    6,134 ms -> 350 ms  (17.5x)
--   get_open_sales_order_lines         133 ms -> 18 ms   (7.5x)
-- Row counts verified identical between old and new implementations for
-- every function, same filter parameters (both zero in this unauthenticated
-- CLI context - the point was confirming identical behavior, not real
-- data access, which needs a real end-user JWT to test).
--
-- No signature, column, filter, or business-logic change anywhere below -
-- every WHERE condition and SELECT column is copied verbatim from the
-- previous LANGUAGE sql body; only WHERE it's computed (once, in a
-- variable) changed. get_companywide_actuals_scoped's portal_rep_id
-- needed an explicit ::text cast that the old LANGUAGE sql body did
-- implicitly - plpgsql's RETURN QUERY requires exact type matches.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_companywide_actuals_scoped(
  p_date_from date,
  p_date_to date DEFAULT NULL::date,
  p_metric_types text[] DEFAULT NULL::text[],
  p_manager_ids uuid[] DEFAULT NULL::uuid[],
  p_rep_ac_ids text[] DEFAULT NULL::text[],
  p_skus text[] DEFAULT NULL::text[],
  p_limit integer DEFAULT 200000,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  metric_type text, brand_category text, amount numeric, rep_id text,
  transaction_date date, customer_id text, dealer_name text, rep_name text,
  portal_rep_id text, sku text, product_class text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rep_ids text[];
  v_rep_filter text[];
  v_manager_filter uuid[];
BEGIN
  v_rep_ids := CASE
    WHEN public.is_admin() OR public.current_manager_id() IS NOT NULL THEN NULL
    WHEN public.current_rep_acctivate_ids() IS NOT NULL THEN public.current_rep_acctivate_ids()
    ELSE ARRAY['__no_rep_mapped__']
  END;
  v_rep_filter := CASE WHEN p_rep_ac_ids IS NOT NULL AND array_length(p_rep_ac_ids, 1) IS NOT NULL
       THEN (SELECT array_agg(lower(trim(x))) FROM unnest(p_rep_ac_ids) x)
       ELSE NULL END;
  v_manager_filter := CASE WHEN (p_rep_ac_ids IS NULL OR array_length(p_rep_ac_ids, 1) IS NULL)
       THEN p_manager_ids ELSE NULL END;

  RETURN QUERY
  SELECT
    a.metric_type, a.brand_category, a.amount, a.rep_id,
    a.transaction_date, a.customer_id, a.dealer_name, a.rep_name,
    a.portal_rep_id::text, a.sku, a.product_class
  FROM public.v_companywide_reporting_actuals a
  WHERE a.transaction_date >= p_date_from
    AND (p_date_to IS NULL OR a.transaction_date <= p_date_to)
    AND (p_metric_types IS NULL OR a.metric_type = ANY(p_metric_types))
    AND (p_skus IS NULL OR array_length(p_skus, 1) IS NULL OR a.sku = ANY(p_skus))
    AND (v_manager_filter IS NULL OR a.manager_id = ANY(v_manager_filter))
    AND (v_rep_filter IS NULL
         OR (NULLIF(TRIM(a.rep_id::text), '') IS NOT NULL AND lower(TRIM(a.rep_id::text)) = ANY(v_rep_filter)))
    AND (v_rep_ids IS NULL
         OR (NULLIF(TRIM(a.rep_id::text), '') IS NOT NULL AND lower(TRIM(a.rep_id::text)) = ANY(v_rep_ids)))
  ORDER BY a.transaction_date, a.customer_id, a.metric_type, a.product_class, a.brand_category, a.rep_id, a.amount
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_daily_invoiced_actuals_scoped(
  p_date date,
  p_manager_ids uuid[] DEFAULT NULL::uuid[],
  p_rep_ac_ids text[] DEFAULT NULL::text[]
)
RETURNS TABLE(metric_type text, brand_category text, amount numeric, rep_id text, transaction_date date)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rep_ids text[];
  v_rep_filter text[];
  v_manager_filter uuid[];
BEGIN
  v_rep_ids := CASE
    WHEN public.is_admin() OR public.current_manager_id() IS NOT NULL THEN NULL
    WHEN public.current_rep_acctivate_ids() IS NOT NULL THEN public.current_rep_acctivate_ids()
    ELSE ARRAY['__no_rep_mapped__']
  END;
  v_rep_filter := CASE WHEN p_rep_ac_ids IS NOT NULL AND array_length(p_rep_ac_ids, 1) IS NOT NULL
       THEN (SELECT array_agg(lower(trim(x))) FROM unnest(p_rep_ac_ids) x)
       ELSE NULL END;
  v_manager_filter := CASE WHEN (p_rep_ac_ids IS NULL OR array_length(p_rep_ac_ids, 1) IS NULL)
       THEN p_manager_ids ELSE NULL END;

  RETURN QUERY
  SELECT a.metric_type, a.brand_category, a.amount, a.rep_id, a.transaction_date
  FROM public.v_daily_invoiced_actuals a
  WHERE a.transaction_date = p_date
    AND (v_manager_filter IS NULL OR a.manager_id = ANY(v_manager_filter))
    AND (v_rep_filter IS NULL
         OR (NULLIF(TRIM(a.rep_id::text), '') IS NOT NULL AND lower(TRIM(a.rep_id::text)) = ANY(v_rep_filter)))
    AND (v_rep_ids IS NULL
         OR (NULLIF(TRIM(a.rep_id::text), '') IS NOT NULL AND lower(TRIM(a.rep_id::text)) = ANY(v_rep_ids)));
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_manager_reporting_monthly(
  p_manager_id uuid DEFAULT NULL::uuid,
  p_rep_ac_ids text[] DEFAULT NULL::text[],
  p_years integer[] DEFAULT NULL::integer[]
)
RETURNS TABLE(metric_type text, year integer, month_number integer, total_amount numeric, row_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rep_ids text[];
BEGIN
  v_rep_ids := CASE
    WHEN public.is_admin() OR public.current_manager_id() IS NOT NULL OR public.has_effective_role(auth.uid(), 'manager') THEN p_rep_ac_ids
    WHEN public.current_rep_acctivate_ids() IS NOT NULL THEN public.current_rep_acctivate_ids()
    ELSE ARRAY['__no_rep_mapped__']
  END;

  RETURN QUERY
  SELECT
    a.metric_type,
    a.year,
    a.month_number,
    COALESCE(SUM(a.amount), 0) AS total_amount,
    COUNT(*)                   AS row_count
  FROM public.v_companywide_reporting_actuals a
  WHERE
    (p_years IS NULL OR a.year = ANY(p_years))
    AND (
      (v_rep_ids IS NOT NULL
        AND NULLIF(TRIM(a.rep_id), '') IS NOT NULL
        AND LOWER(TRIM(a.rep_id)) = ANY(
          SELECT LOWER(TRIM(x)) FROM unnest(v_rep_ids) AS x
          WHERE NULLIF(TRIM(x), '') IS NOT NULL
        ))
      OR
      (v_rep_ids IS NULL
        AND (p_manager_id IS NULL OR a.manager_id = p_manager_id))
    )
  GROUP BY 1, 2, 3
  ORDER BY 1, 2, 3;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_open_sales_order_lines(
  p_group_by text,
  p_entity_key text,
  p_customer_ids text[] DEFAULT NULL::text[],
  p_brand_cats text[] DEFAULT NULL::text[],
  p_skus text[] DEFAULT NULL::text[],
  p_rep_ids text[] DEFAULT NULL::text[],
  p_manager_id uuid DEFAULT NULL::uuid,
  p_limit integer DEFAULT 2000,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(guid_order text, order_number text, order_date date, requested_ship_date date, customer_id text, dealer_name text, rep_id text, rep_name text, fulfillment_type text, warehouse text, sku text, description text, product_class text, brand_category text, qty_ordered numeric, qty_shipped numeric, qty_open numeric, unit_price numeric, line_discount_pct numeric, net_open_amount numeric, customer_po_number text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rep_ids text[];
BEGIN
  v_rep_ids := CASE
    WHEN public.is_admin() OR public.current_manager_id() IS NOT NULL OR public.has_effective_role(auth.uid(), 'manager') THEN p_rep_ids
    WHEN public.current_rep_acctivate_ids() IS NOT NULL THEN public.current_rep_acctivate_ids()
    ELSE ARRAY['__no_rep_mapped__']
  END;

  RETURN QUERY
  SELECT
    a.guid_order, a.order_number, a.order_date, a.requested_ship_date,
    a.customer_id, a.dealer_name, a.rep_id, a.rep_name,
    a.fulfillment_type, a.warehouse, a.sku, a.description, a.product_class,
    a.brand_category, a.qty_ordered, a.qty_shipped, a.qty_open,
    a.unit_price, a.line_discount_pct, a.open_so_amount,
    a.customer_po_number
  FROM public.v_portal_open_sales_order_line_facts a
  WHERE
    (
      (p_group_by = 'dealer' AND p_entity_key = 'UNASSIGNED_DEALER'
       AND NOT EXISTS (
         SELECT 1 FROM public.dealers d
         WHERE d.source <> 'field_only'
           AND (NULLIF(TRIM(d.salesperson), '') IS NOT NULL OR NULLIF(TRIM(d.territory), '') IS NOT NULL)
           AND NULLIF(TRIM(d.acctivate_id), '') IS NOT NULL
           AND lower(TRIM(d.acctivate_id)) = lower(TRIM(a.customer_id::text))
       ))
      OR
      (p_group_by = 'dealer' AND p_entity_key <> 'UNASSIGNED_DEALER'
       AND lower(trim(COALESCE(NULLIF(TRIM(a.customer_id::text), ''), 'Unknown'))) = lower(trim(p_entity_key)))
      OR
      (p_group_by = 'rep'
       AND COALESCE(NULLIF(TRIM(a.rep_id::text), ''), NULLIF(TRIM(a.rep_name::text), ''), 'Unassigned') = p_entity_key)
    )
    AND (p_manager_id IS NULL OR a.manager_id = p_manager_id)
    AND (p_customer_ids IS NULL OR lower(a.customer_id::text) = ANY(p_customer_ids))
    AND (p_brand_cats IS NULL
         OR array_length(p_brand_cats, 1) IS NULL
         OR COALESCE(a.brand_category, '') = ANY(p_brand_cats))
    AND (p_skus IS NULL OR array_length(p_skus, 1) IS NULL OR a.sku = ANY(p_skus))
    AND (v_rep_ids IS NULL
         OR (NULLIF(TRIM(a.rep_id::text), '') IS NOT NULL
             AND lower(TRIM(a.rep_id::text)) = ANY(v_rep_ids)))
  ORDER BY a.order_date DESC, a.order_number, a.sku
  LIMIT  p_limit
  OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_open_so_lines_scoped(
  p_manager_ids uuid[] DEFAULT NULL::uuid[],
  p_limit integer DEFAULT 100000,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  guid_order text, order_number text, customer_id text, dealer_name text,
  rep_id text, rep_name text, sku text, description text, product_class text,
  qty_open numeric, unit_price numeric, line_discount_pct numeric,
  open_so_gross_amount numeric, open_so_amount numeric,
  order_date date, requested_ship_date date, branch_id text, fulfillment_type text,
  customer_po_number text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rep_ids text[];
BEGIN
  v_rep_ids := CASE
    WHEN public.is_admin() OR public.current_manager_id() IS NOT NULL THEN NULL
    WHEN public.current_rep_acctivate_ids() IS NOT NULL THEN public.current_rep_acctivate_ids()
    ELSE ARRAY['__no_rep_mapped__']
  END;

  RETURN QUERY
  SELECT
    a.guid_order, a.order_number, a.customer_id, a.dealer_name,
    a.rep_id, a.rep_name, a.sku, a.description, a.product_class,
    a.qty_open, a.unit_price, a.line_discount_pct,
    a.open_so_gross_amount, a.open_so_amount,
    a.order_date, a.requested_ship_date, a.branch_id, a.fulfillment_type,
    a.customer_po_number
  FROM public.v_portal_open_sales_order_line_facts a
  WHERE (p_manager_ids IS NULL OR a.manager_id = ANY(p_manager_ids))
    AND (v_rep_ids IS NULL
         OR (NULLIF(TRIM(a.rep_id::text), '') IS NOT NULL
             AND lower(TRIM(a.rep_id::text)) = ANY(v_rep_ids)))
  ORDER BY a.order_number, a.sku, a.open_so_amount
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

COMMIT;
