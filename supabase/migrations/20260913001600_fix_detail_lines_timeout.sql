-- ══════════════════════════════════════════════════════════════════════════════
-- Root cause: get_sales_reporting_detail_lines is LANGUAGE sql SECURITY
-- DEFINER. Postgres cannot inline SECURITY DEFINER SQL functions, so the
-- body is executed as an opaque Function Scan using PARAMETER PLACEHOLDERS
-- ($1, $2, ...) rather than the actual bound values - the planner cannot
-- see that p_entity_key = 'House' when costing the plan, so it picks a
-- plan that does not push the highly-selective entity_key filter down
-- through the v_portal_dealer_rep_reporting_lines -> get_portal_invoiced_lines()
-- UNION ALL early enough.
--
-- Confirmed via EXPLAIN ANALYZE:
--   SELECT * FROM get_sales_reporting_detail_lines(p_entity_key:='House', ...)
--     -> Execution Time: 9505 ms  (exceeds the `authenticated` role's 8s
--        statement_timeout - this is exactly the 500 / code 57014 error
--        seen live in Rep Reporting for the "House" rep)
--   The identical query, hand-inlined with literal values instead of a
--   function call:
--     -> Execution Time: 883 ms
--
-- Fix: convert to LANGUAGE plpgsql and build + EXECUTE the query dynamically
-- with format(%L), which embeds the actual argument VALUES as literals in
-- a freshly-planned statement each call - giving the planner real
-- selectivity information instead of opaque bind parameters. This mirrors
-- the fast, hand-inlined path exactly. WHERE-clause semantics, column list,
-- ORDER BY, and every filter are byte-for-byte unchanged from the prior
-- version - only how the query reaches the planner changes.
--
-- get_sales_reporting_grouped_rows (1.69s) and get_open_sales_order_lines
-- (0.32s) were checked the same way and are comfortably under the 8s
-- timeout as-is - not touched by this migration.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_sales_reporting_detail_lines(
  p_metric text,
  p_group_by text,
  p_entity_key text,
  p_from date,
  p_to date,
  p_customer_ids text[] DEFAULT NULL::text[],
  p_brand_cats text[] DEFAULT NULL::text[],
  p_skus text[] DEFAULT NULL::text[],
  p_rep_ids text[] DEFAULT NULL::text[],
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0,
  p_manager_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  transaction_date date, invoice_number text, dealer_name text, rep_name text,
  rep_id text, customer_id text, sku text, description text, brand_category text,
  product_class text, amount numeric, invoice_type text, fulfillment_type text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY EXECUTE format(
    $sql$
    SELECT
      a.transaction_date,
      a.invoice_number::text,
      a.dealer_name::text,
      a.rep_name::text,
      a.rep_id::text,
      a.customer_id::text,
      a.sku::text,
      a.description::text,
      a.brand_category::text,
      a.product_class::text,
      a.amount::numeric,
      a.invoice_type::text,
      a.fulfillment_type::text
    FROM public.v_companywide_reporting_actuals a
    WHERE a.metric_type = %1$L
      AND a.transaction_date BETWEEN %2$L AND %3$L
      AND (
        (%4$L = 'dealer'
         AND COALESCE(NULLIF(TRIM(a.customer_id::text), ''), 'Unknown') = %5$L)
        OR
        (%4$L = 'rep'
         AND COALESCE(NULLIF(TRIM(a.rep_id::text), ''), NULLIF(TRIM(a.rep_name::text), ''), 'Unassigned') = %5$L)
      )
      AND (%6$L::uuid IS NULL OR a.manager_id = %6$L::uuid)
      AND (%7$L::text[] IS NULL OR lower(a.customer_id::text) = ANY(%7$L::text[]))
      AND (%8$L::text[] IS NULL
           OR array_length(%8$L::text[], 1) IS NULL
           OR COALESCE(a.brand_category,
                CASE WHEN %1$L = 'invoiced' THEN 'Historical Invoice' ELSE '' END
              ) = ANY(%8$L::text[]))
      AND (%9$L::text[] IS NULL OR array_length(%9$L::text[], 1) IS NULL OR a.sku = ANY(%9$L::text[]))
      AND (%10$L::text[] IS NULL
           OR (NULLIF(TRIM(a.rep_id::text), '') IS NOT NULL
               AND lower(TRIM(a.rep_id::text)) = ANY(%10$L::text[])))
    ORDER BY a.transaction_date DESC, a.invoice_number NULLS LAST
    LIMIT %11$L::integer OFFSET %12$L::integer
    $sql$,
    p_metric, p_from, p_to,
    p_group_by, p_entity_key,
    p_manager_id,
    p_customer_ids,
    p_brand_cats,
    p_skus,
    p_rep_ids,
    p_limit, p_offset
  );
END;
$function$;

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- 1. "House" must now complete well under 8s and return the same rows/total
--    as before:
--    EXPLAIN ANALYZE SELECT * FROM get_sales_reporting_detail_lines(
--      p_metric:='bookings', p_group_by:='rep', p_entity_key:='House',
--      p_from:='2026-07-01', p_to:='2026-09-10', p_customer_ids:=NULL,
--      p_brand_cats:=NULL, p_skus:=NULL, p_rep_ids:=NULL, p_limit:=500,
--      p_offset:=0, p_manager_id:=NULL);
--    -- expect ~372 rows, sum $273,788.24, well under 1s
--
-- 2. Every previously-reconciled rep/dealer (Brent, DE, MD, Inter, Quill,
--    Roomstogo, Hudsons, Wayfair, Cardi's) must return identical row
--    counts and sums to before this migration.
--
-- 3. Dealer branch (p_group_by='dealer') must be unaffected - same
--    behavior, same results, just re-planned via EXECUTE.
-- ══════════════════════════════════════════════════════════════════════════════
