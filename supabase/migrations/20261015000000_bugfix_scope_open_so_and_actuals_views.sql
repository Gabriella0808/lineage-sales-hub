-- Bug sweep (bugfix/portal-stability-sweep) — close a real, confirmed data-
-- scoping gap on three reporting views.
--
-- v_portal_open_sales_order_line_facts, v_companywide_reporting_actuals, and
-- v_daily_invoiced_actuals are plain views (no RLS - views can't carry it)
-- granted SELECT to anon/authenticated and never revoked. Everywhere else in
-- this codebase, the exact same underlying data is only ever exposed through
-- a SECURITY DEFINER RPC that computes an "effective" rep-id filter from
-- current_rep_acctivate_ids()/is_admin()/current_manager_id() - see
-- get_sales_reporting_grouped_rows, get_open_sales_order_lines,
-- get_manager_reporting_monthly, etc. in 20260914000200/20260914001000.
-- These three views never got that treatment, and several call sites query
-- them DIRECTLY and rely on CLIENT-SIDE filtering only - which is not a
-- security boundary. Confirmed real-world reachable, not just theoretical:
-- src/hooks/usePreSale.ts queries v_companywide_reporting_actuals with NO
-- scoping at all (not even client-side), and the Pre-Sale page is explicitly
-- open to reps - so today, any rep viewing Pre-Sale receives every dealer's
-- and every rep's bookings for the matched SKUs, company-wide, not just
-- their own.
--
-- Fix: three new scoped RPCs, each the same "effective" CTE idiom already
-- used everywhere else, then every direct-view consumer repointed to the
-- matching RPC (see the accompanying frontend changes in this same commit),
-- then SELECT revoked from anon/authenticated on all three views so the gap
-- is closed at the data layer too, not just in the UI that happens to call
-- it. No business logic/formula changes - these RPCs return exactly the
-- same rows/columns the direct queries already selected; the only change is
-- WHO is allowed to see WHICH rows, enforced server-side instead of
-- (incompletely, or not at all) client-side.

BEGIN;

-- ── 1. Open sales order line facts, scoped ──────────────────────────────
-- Superset of every consumer's column needs (LiveKpiReport.tsx,
-- ExecutiveOverview.tsx, useOpenSalesOrders.ts, useInventoryHub.ts) - each
-- caller just reads the subset of columns it needs, same as a direct
-- .select() would have. p_manager_ids plural (not singular uuid) because
-- callers pass a manager's full duplicate-record id set (sync placeholder
-- rows), same as the existing .in("manager_id", managerIds) client calls.
-- CREATE OR REPLACE can't change a RETURNS TABLE column list - this DROP
-- (same signature) is needed before adding customer_po_number below (see
-- this bug sweep's Finding 1: the Backlog table was missing it entirely).
DROP FUNCTION IF EXISTS public.get_open_so_lines_scoped(uuid[], integer, integer);

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
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH effective AS (
    SELECT CASE
      WHEN public.is_admin() OR public.current_manager_id() IS NOT NULL THEN NULL
      WHEN public.current_rep_acctivate_ids() IS NOT NULL THEN public.current_rep_acctivate_ids()
      ELSE ARRAY['__no_rep_mapped__']
    END AS rep_ids
  )
  SELECT
    a.guid_order, a.order_number, a.customer_id, a.dealer_name,
    a.rep_id, a.rep_name, a.sku, a.description, a.product_class,
    a.qty_open, a.unit_price, a.line_discount_pct,
    a.open_so_gross_amount, a.open_so_amount,
    a.order_date, a.requested_ship_date, a.branch_id, a.fulfillment_type,
    a.customer_po_number
  FROM public.v_portal_open_sales_order_line_facts a, effective
  WHERE (p_manager_ids IS NULL OR a.manager_id = ANY(p_manager_ids))
    AND (effective.rep_ids IS NULL
         OR (NULLIF(TRIM(a.rep_id::text), '') IS NOT NULL
             AND lower(TRIM(a.rep_id::text)) = ANY(effective.rep_ids)))
  ORDER BY a.order_number, a.sku, a.open_so_amount
  LIMIT p_limit OFFSET p_offset
$function$;

GRANT EXECUTE ON FUNCTION public.get_open_so_lines_scoped(uuid[], integer, integer) TO authenticated;

-- ── 2. Company-wide reporting actuals, scoped ───────────────────────────
-- Superset for LiveKpiReport.tsx's daily bookings query, ExecutiveOverview's
-- range query, usePreSale.ts's SKU-filtered query, and TargetProgressChart's
-- RepTargetPanel. p_rep_ac_ids is an explicit "show me only these reps"
-- narrowing (what RepTargetPanel and LiveKpiReport's individual-rep-picker
-- already did client-side) - distinct from the effective-CTE's rep_ids,
-- which is the per-caller SECURITY boundary and can't be widened by this
-- param (a rep passing someone else's id here still gets 0 rows, since both
-- conditions are ANDed).
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
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH effective AS (
    SELECT CASE
      WHEN public.is_admin() OR public.current_manager_id() IS NOT NULL THEN NULL
      WHEN public.current_rep_acctivate_ids() IS NOT NULL THEN public.current_rep_acctivate_ids()
      ELSE ARRAY['__no_rep_mapped__']
    END AS rep_ids
  ),
  selection AS (
    SELECT
      CASE WHEN p_rep_ac_ids IS NOT NULL AND array_length(p_rep_ac_ids, 1) IS NOT NULL
           THEN (SELECT array_agg(lower(trim(x))) FROM unnest(p_rep_ac_ids) x)
           ELSE NULL END AS rep_filter,
      -- Mirrors every existing call site's own rule: an explicit rep
      -- selection overrides/ignores the manager filter rather than
      -- stacking with it (e.g. LiveKpiReport.tsx's
      -- "if (managerId && !(selectedRepAcIds?.length)) ...").
      CASE WHEN (p_rep_ac_ids IS NULL OR array_length(p_rep_ac_ids, 1) IS NULL)
           THEN p_manager_ids ELSE NULL END AS manager_filter
  )
  SELECT
    a.metric_type, a.brand_category, a.amount, a.rep_id,
    a.transaction_date, a.customer_id, a.dealer_name, a.rep_name,
    a.portal_rep_id, a.sku, a.product_class
  FROM public.v_companywide_reporting_actuals a, effective, selection
  WHERE a.transaction_date >= p_date_from
    AND (p_date_to IS NULL OR a.transaction_date <= p_date_to)
    AND (p_metric_types IS NULL OR a.metric_type = ANY(p_metric_types))
    AND (p_skus IS NULL OR array_length(p_skus, 1) IS NULL OR a.sku = ANY(p_skus))
    AND (selection.manager_filter IS NULL OR a.manager_id = ANY(selection.manager_filter))
    AND (selection.rep_filter IS NULL
         OR (NULLIF(TRIM(a.rep_id::text), '') IS NOT NULL AND lower(TRIM(a.rep_id::text)) = ANY(selection.rep_filter)))
    AND (effective.rep_ids IS NULL
         OR (NULLIF(TRIM(a.rep_id::text), '') IS NOT NULL AND lower(TRIM(a.rep_id::text)) = ANY(effective.rep_ids)))
  ORDER BY a.transaction_date, a.customer_id, a.metric_type, a.product_class, a.brand_category, a.rep_id, a.amount
  LIMIT p_limit OFFSET p_offset
$function$;

GRANT EXECUTE ON FUNCTION public.get_companywide_actuals_scoped(date, date, text[], uuid[], text[], text[], integer, integer) TO authenticated;

-- ── 3. Daily invoiced actuals (the FIN-category-corrected view), scoped ──
-- Same shape/filters as #2 but sourced from v_daily_invoiced_actuals -
-- deliberately a separate function (not a parameter on #2) since it's a
-- genuinely different view with its own correction logic (see
-- LiveKpiReport.tsx's existing comment on why FIN needs this dedicated view).
CREATE OR REPLACE FUNCTION public.get_daily_invoiced_actuals_scoped(
  p_date date,
  p_manager_ids uuid[] DEFAULT NULL::uuid[],
  p_rep_ac_ids text[] DEFAULT NULL::text[]
)
RETURNS TABLE(metric_type text, brand_category text, amount numeric, rep_id text, transaction_date date)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH effective AS (
    SELECT CASE
      WHEN public.is_admin() OR public.current_manager_id() IS NOT NULL THEN NULL
      WHEN public.current_rep_acctivate_ids() IS NOT NULL THEN public.current_rep_acctivate_ids()
      ELSE ARRAY['__no_rep_mapped__']
    END AS rep_ids
  ),
  selection AS (
    SELECT
      CASE WHEN p_rep_ac_ids IS NOT NULL AND array_length(p_rep_ac_ids, 1) IS NOT NULL
           THEN (SELECT array_agg(lower(trim(x))) FROM unnest(p_rep_ac_ids) x)
           ELSE NULL END AS rep_filter,
      CASE WHEN (p_rep_ac_ids IS NULL OR array_length(p_rep_ac_ids, 1) IS NULL)
           THEN p_manager_ids ELSE NULL END AS manager_filter
  )
  SELECT a.metric_type, a.brand_category, a.amount, a.rep_id, a.transaction_date
  FROM public.v_daily_invoiced_actuals a, effective, selection
  WHERE a.transaction_date = p_date
    AND (selection.manager_filter IS NULL OR a.manager_id = ANY(selection.manager_filter))
    AND (selection.rep_filter IS NULL
         OR (NULLIF(TRIM(a.rep_id::text), '') IS NOT NULL AND lower(TRIM(a.rep_id::text)) = ANY(selection.rep_filter)))
    AND (effective.rep_ids IS NULL
         OR (NULLIF(TRIM(a.rep_id::text), '') IS NOT NULL AND lower(TRIM(a.rep_id::text)) = ANY(effective.rep_ids)))
$function$;

GRANT EXECUTE ON FUNCTION public.get_daily_invoiced_actuals_scoped(date, uuid[], text[]) TO authenticated;

-- Deliberately NOT revoking SELECT on the three views in this same
-- migration: that must only happen after every known direct consumer in
-- the frontend is confirmed repointed to the RPCs above (and verified to
-- still compile/build) - see the follow-up migration
-- 20261015010000_bugfix_revoke_open_so_and_actuals_views.sql, applied only
-- once that's done.

COMMIT;
