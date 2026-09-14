-- ══════════════════════════════════════════════════════════════════════════════
-- Bug: Dealer Reporting drawer (line-level detail) disagrees with its own
-- card total whenever a Dealer filter AND a Rep filter are both active at
-- once (e.g. clicking into a specific dealer while "Andrew Smith" is also
-- selected as the rep). Example: Stanson Floor Covering & Furniture showed
-- a $336 card total but only $198 in the expanded line detail.
--
-- Root cause: get_sales_reporting_grouped_rows's dealer branch only uses
-- the rep filter to decide which DEALERS are in scope (the `roster` CTE,
-- matched via dealers.rep_id -> sales_reps.acctivate_id). Once a dealer
-- passes that roster check, ALL of its invoice/booking lines are summed
-- into the card total, regardless of each individual line's own
-- transaction-level rep_id. get_sales_reporting_detail_lines did not
-- mirror this: it re-applied the rep filter as a hard per-LINE predicate
-- even in dealer mode, so any line coded under a different rep_id than the
-- one currently selected (e.g. a legacy/orphaned code like "MICH") was
-- silently dropped from the drawer while still being counted in the card
-- total above it.
--
-- Fix: for dealer-mode detail lines, check ONCE that the requested dealer
-- itself is inside the caller's effective rep scope (same roster join
-- get_sales_reporting_grouped_rows already uses), then return ALL of that
-- dealer's lines - no more per-line rep_id filter in dealer mode. This
-- also tightens security versus before: previously a rep could call this
-- RPC directly with an out-of-roster dealer's entity_key and still get
-- back any of that dealer's lines that happened to carry their own rep
-- code; now the dealer itself must be in their roster or nothing is
-- returned. Rep-mode (p_group_by='rep') is completely unchanged - it
-- still hard-filters by the caller's effective rep_ids exactly as before,
-- which is the correct/only security boundary in that mode. The
-- UNASSIGNED_DEALER bucket is also gated the same way
-- get_sales_reporting_grouped_rows already gates it (unfiltered/staff
-- view only), so it can no longer be queried directly by a scoped caller.
--
-- No aggregation logic (SUM/COUNT/joins), no formulas, no invoice/booking/
-- Open SO calculations, no dealer roster or territory data change here -
-- only which rows get returned to match what the card total already shows.
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
 RETURNS TABLE(transaction_date date, invoice_number text, dealer_name text, rep_name text, rep_id text, customer_id text, sku text, description text, brand_category text, product_class text, amount numeric, invoice_type text, fulfillment_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dealer_match text;
  v_effective_rep_ids text[];
  v_line_rep_filter text[];
  v_dealer_in_scope boolean;
BEGIN
  v_effective_rep_ids := CASE
    WHEN public.is_admin() OR public.current_manager_id() IS NOT NULL THEN p_rep_ids
    WHEN public.current_rep_acctivate_ids() IS NOT NULL THEN public.current_rep_acctivate_ids()
    ELSE ARRAY['__no_rep_mapped__']
  END;

  -- Dealer mode: security/scope is enforced once at the dealer-roster level
  -- below (matching get_sales_reporting_grouped_rows's own dealer branch),
  -- so no additional per-line rep filter. Rep mode keeps the original
  -- per-line filter unchanged.
  v_line_rep_filter := CASE WHEN p_group_by = 'rep' THEN v_effective_rep_ids ELSE NULL END;

  IF p_group_by = 'dealer' AND p_entity_key = 'UNASSIGNED_DEALER' THEN
    IF v_effective_rep_ids IS NOT NULL THEN
      RETURN; -- matches grouped_rows: this bucket only exists in the fully unscoped (staff, unfiltered) view
    END IF;
    v_dealer_match := $pred$
      NOT EXISTS (
        SELECT 1 FROM public.dealers d
        WHERE d.source <> 'field_only'
          AND (NULLIF(TRIM(d.salesperson), '') IS NOT NULL OR NULLIF(TRIM(d.territory), '') IS NOT NULL)
          AND NULLIF(TRIM(d.acctivate_id), '') IS NOT NULL
          AND lower(TRIM(d.acctivate_id)) = lower(TRIM(a.customer_id::text))
      )
    $pred$;
  ELSIF p_group_by = 'dealer' THEN
    IF v_effective_rep_ids IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.dealers d
        LEFT JOIN public.sales_reps sr ON sr.id = d.rep_id
        WHERE d.source <> 'field_only'
          AND (NULLIF(TRIM(d.salesperson), '') IS NOT NULL OR NULLIF(TRIM(d.territory), '') IS NOT NULL)
          AND NULLIF(TRIM(d.acctivate_id), '') IS NOT NULL
          AND lower(TRIM(d.acctivate_id)) = lower(TRIM(p_entity_key))
          AND NULLIF(TRIM(sr.acctivate_id), '') IS NOT NULL
          AND lower(TRIM(sr.acctivate_id)) = ANY(v_effective_rep_ids)
      ) INTO v_dealer_in_scope;

      IF NOT v_dealer_in_scope THEN
        RETURN; -- this dealer's roster rep is outside the caller's effective scope
      END IF;
    END IF;

    v_dealer_match := format(
      'COALESCE(NULLIF(TRIM(a.customer_id::text), %L), %L) = %L',
      '', 'Unknown', p_entity_key
    );
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
    v_line_rep_filter,
    p_limit, p_offset,
    v_dealer_match
  );
END;
$function$;
