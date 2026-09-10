-- ══════════════════════════════════════════════════════════════════════════════
-- Root cause: get_sales_reporting_grouped_rows' dealer branch aggregates
-- every dealer row with NO roster match at all into a synthetic bucket:
--   entity_key = 'UNASSIGNED_DEALER'
-- ("Unmatched / Unassigned Dealer" in the UI), computed via:
--   NOT EXISTS (SELECT 1 FROM roster r WHERE r.cust_key = sa.cust_key)
--
-- get_sales_reporting_detail_lines had no knowledge of this - its dealer
-- branch matches on a plain equality:
--   COALESCE(NULLIF(TRIM(a.customer_id::text), ''), 'Unknown') = p_entity_key
-- 'UNASSIGNED_DEALER' is a synthetic label, never a real customer_id, so
-- this could never match any row. Clicking that row in Dealer Reporting
-- always returned 0 detail rows against a non-zero parent total ($170,643
-- as of 2026-09-10), which is exactly the retryable-mismatch error state.
--
-- Fix: when p_group_by = 'dealer' and p_entity_key = 'UNASSIGNED_DEALER',
-- use the same "not in the matched dealer roster" predicate the grouped-
-- rows RPC uses, instead of a literal equality match. Verified directly:
-- 411 rows, $170,643.10 - exact match to the parent total. Every other
-- entity_key (a real customer_id, or 'rep' branch) is completely
-- unaffected - same predicate as the previous version of this function.
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
DECLARE
  v_dealer_match text;
BEGIN
  IF p_group_by = 'dealer' AND p_entity_key = 'UNASSIGNED_DEALER' THEN
    v_dealer_match := $pred$
      NOT EXISTS (
        SELECT 1 FROM public.dealers d
        WHERE d.source <> 'field_only'
          AND (NULLIF(TRIM(d.salesperson), '') IS NOT NULL OR NULLIF(TRIM(d.territory), '') IS NOT NULL)
          AND NULLIF(TRIM(d.acctivate_id), '') IS NOT NULL
          AND lower(TRIM(d.acctivate_id)) = lower(TRIM(a.customer_id::text))
      )
    $pred$;
  ELSE
    v_dealer_match := format(
      'COALESCE(NULLIF(TRIM(a.customer_id::text), %L), %L) = %L',
      '', 'Unknown', p_entity_key
    );
  END IF;

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
        (%4$L = 'dealer' AND (%13$s))
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
    p_limit, p_offset,
    v_dealer_match
  );
END;
$function$;

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- 1. Unassigned/unmatched dealer bucket must now reconcile:
--    SELECT count(*), round(sum(amount)::numeric,2)
--    FROM get_sales_reporting_detail_lines(p_metric:='bookings', p_group_by:='dealer',
--      p_entity_key:='UNASSIGNED_DEALER', p_from:='2026-07-01', p_to:='2026-09-10',
--      p_customer_ids:=NULL, p_brand_cats:=NULL, p_skus:=NULL, p_rep_ids:=NULL,
--      p_limit:=100000, p_offset:=0, p_manager_id:=NULL);
--    -- expect 411 rows, $170,643.10
--
-- 2. Every previously-reconciled real dealer and rep (Roomstogo, Hudsons,
--    Wayfair, Cardi's, Brent, DE, MD, Inter, Quill, House) must return
--    identical row counts and sums to before this migration.
-- ══════════════════════════════════════════════════════════════════════════════
