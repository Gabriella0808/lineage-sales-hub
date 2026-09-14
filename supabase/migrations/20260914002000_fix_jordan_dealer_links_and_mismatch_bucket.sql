-- ══════════════════════════════════════════════════════════════════════════════
-- FIX 1: correct 5 dealers' rep_id links for Jordan Shindell.
--
-- These 5 dealers were linked to a generic placeholder sales_reps row
-- ("Jordan Shindell", acctivate_id = NULL) that predates the PA/OH vs Beach
-- territory split and can never match a real transaction rep code. Their
-- actual invoices are already correctly coded Shin/Shin2 at the transaction
-- level (confirmed via diagnostic query), so this repoints dealers.rep_id at
-- the correct real sales_reps row per invoice-attributed territory. Only
-- rep_id changes - territory/territory_id, manager_id, and every other
-- dealer field are left exactly as they are (not invented, not derived from
-- rep_territories, per explicit instruction).
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE public.dealers SET rep_id = '9d218273-c52d-4103-8695-29b756d3f120' -- Shin2 / Shindell - PA/OH
WHERE acctivate_id IN ('Rileys Furniture', 'Christmas Tree Hill, Inc', 'Dewey Furniture & Carpeting, Inc');

UPDATE public.dealers SET rep_id = '96ec9def-176e-4d5e-9a0a-2823d59bd9f4' -- Shin / Shindell- Beach
WHERE acctivate_id IN ('JOHNNYJANOSI', 'CASUALDESIGN');

-- ══════════════════════════════════════════════════════════════════════════════
-- FIX 2: add a visible "Unmatched / Roster Mismatch Dealer" bucket to
-- get_sales_reporting_grouped_rows' dealer branch, scoped to the caller's
-- effective rep scope.
--
-- The existing "Unmatched / Unassigned Dealer" bucket only fires when
-- v_effective_rep_ids IS NULL (a fully unfiltered, company-wide view) - so
-- for ANY rep-scoped dealer view (an admin filtering Rep/Dealer Reporting by
-- a specific rep, or a rep viewing their own account, which is now always
-- rep-scoped per the prior session's security fix), a transaction line whose
-- rep_id matches the scope but whose customer doesn't resolve into that
-- scope's roster (missing dealer row, blank/placeholder rep link, dealer
-- assigned to someone else, etc.) simply vanished from the total with no
-- visible indicator - exactly the bug that caused Jordan's Dealer vs Rep
-- Reporting mismatch, and would recur for any other dealer with a similar
-- roster gap.
--
-- New CTEs (rep_scope_mismatch_src/_agg/_open_so) independently re-derive
-- which invoice/booking/open-SO rows belong to the effective rep scope by
-- their own TRANSACTION-level rep_id (same matching the rep branch already
-- uses), then subtract whatever already matched the roster. Only fires when
-- v_effective_rep_ids IS NOT NULL - the mutual exclusion with the existing
-- bucket's "IS NULL" guard means they never both appear in one call. Gated
-- on p_customer_ids IS NULL like the original bucket (a mismatch aggregate
-- doesn't make sense once specific dealers are hand-picked); still respects
-- p_manager_id when a caller sets one, same as every other CTE in this
-- function.
--
-- Security: v_effective_rep_ids is computed once, at the top of this
-- function, from the CALLER'S OWN identity for any non-staff caller
-- (unchanged from the prior migration) - so this bucket is automatically and
-- identically scoped to whatever the rep is already restricted to. A rep
-- can never see another rep's mismatched rows through this bucket, because
-- v_effective_rep_ids can never contain another rep's code for a rep caller.
--
-- Aggregation logic itself (SUM/COUNT over amount/fulfillment_type) is
-- copy-pasted from the existing sales_agg/open_so_agg CTEs, unchanged -
-- nothing about how bookings/invoiced/open-SO amounts are calculated is
-- touched anywhere in this migration.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_sales_reporting_grouped_rows(p_metric text, p_group_by text, p_from date, p_to date, p_comp_from date DEFAULT NULL::date, p_comp_to date DEFAULT NULL::date, p_customer_ids text[] DEFAULT NULL::text[], p_brand_cats text[] DEFAULT NULL::text[], p_skus text[] DEFAULT NULL::text[], p_rep_ids text[] DEFAULT NULL::text[], p_manager_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(entity_key text, entity_label text, primary_amt numeric, primary_lines bigint, comp_amt numeric, comp_lines bigint, container_amt numeric, warehouse_amt numeric, customer_id text, rep_name text, territory_name text, manager_name text, open_so_value numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_effective_rep_ids text[];
BEGIN
  v_effective_rep_ids := CASE
    WHEN public.is_admin() OR public.current_manager_id() IS NOT NULL THEN p_rep_ids
    WHEN public.current_rep_acctivate_ids() IS NOT NULL THEN public.current_rep_acctivate_ids()
    ELSE ARRAY['__no_rep_mapped__']
  END;

  IF p_group_by = 'dealer' THEN
    RETURN QUERY
    WITH roster AS (
      SELECT
        d.acctivate_id                                  AS ac_id,
        lower(trim(d.acctivate_id))                      AS cust_key,
        d.name,
        sr.acctivate_id                                  AS rep_ac_id,
        COALESCE(sr.name, d.salesperson)                 AS rep_display_name,
        t.name                                           AS territory_name,
        m.name                                            AS manager_name
      FROM public.dealers d
      LEFT JOIN public.sales_reps sr  ON sr.id = d.rep_id
      LEFT JOIN public.territories t  ON t.id  = d.territory_id
      LEFT JOIN public.managers m     ON m.id  = d.manager_id
      WHERE d.source <> 'field_only'
        AND (NULLIF(TRIM(d.salesperson), '') IS NOT NULL OR NULLIF(TRIM(d.territory), '') IS NOT NULL)
        AND NULLIF(TRIM(d.acctivate_id), '') IS NOT NULL
        AND (p_customer_ids IS NULL OR lower(trim(d.acctivate_id)) = ANY(p_customer_ids))
        AND (p_manager_id IS NULL OR d.manager_id = p_manager_id)
        AND (v_effective_rep_ids IS NULL
             OR (NULLIF(TRIM(sr.acctivate_id), '') IS NOT NULL
                 AND lower(trim(sr.acctivate_id)) = ANY(v_effective_rep_ids)))
    ),
    sales_src AS (
      SELECT
        lower(trim(a.customer_id::text)) AS cust_key,
        a.customer_id,
        a.amount,
        a.fulfillment_type,
        a.transaction_date
      FROM public.v_companywide_reporting_actuals a
      WHERE a.metric_type = p_metric
        AND a.transaction_date >= LEAST(p_from, COALESCE(p_comp_from, p_from))
        AND a.transaction_date <= GREATEST(p_to, COALESCE(p_comp_to, p_to))
        AND (p_brand_cats IS NULL
             OR array_length(p_brand_cats, 1) IS NULL
             OR COALESCE(a.brand_category,
                  CASE WHEN p_metric = 'invoiced' THEN 'Historical Invoice' ELSE '' END
                ) = ANY(p_brand_cats))
        AND (p_skus IS NULL OR array_length(p_skus, 1) IS NULL OR a.sku = ANY(p_skus))
    ),
    sales_agg AS (
      SELECT
        cust_key,
        MAX(sales_src.customer_id::text)                                                             AS orig_customer_id,
        COALESCE(SUM(amount) FILTER (WHERE transaction_date BETWEEN p_from AND p_to), 0)::numeric   AS primary_amt,
        COALESCE(COUNT(*)    FILTER (WHERE transaction_date BETWEEN p_from AND p_to), 0)::bigint    AS primary_lines,
        COALESCE(SUM(amount) FILTER (WHERE p_comp_from IS NOT NULL AND transaction_date BETWEEN p_comp_from AND p_comp_to), 0)::numeric AS comp_amt,
        COALESCE(COUNT(*)    FILTER (WHERE p_comp_from IS NOT NULL AND transaction_date BETWEEN p_comp_from AND p_comp_to), 0)::bigint  AS comp_lines,
        COALESCE(SUM(amount) FILTER (WHERE transaction_date BETWEEN p_from AND p_to AND fulfillment_type = 'container'), 0)::numeric   AS container_amt,
        COALESCE(SUM(amount) FILTER (WHERE transaction_date BETWEEN p_from AND p_to AND fulfillment_type = 'warehouse'), 0)::numeric   AS warehouse_amt
      FROM sales_src
      GROUP BY cust_key
    ),
    open_so_agg AS (
      SELECT lower(trim(o.customer_id::text)) AS cust_key, SUM(o.open_so_amount) AS open_so_value
      FROM public.v_portal_open_sales_order_line_facts o
      WHERE NULLIF(TRIM(o.customer_id::text), '') IS NOT NULL
      GROUP BY 1
    ),
    unmatched_agg AS (
      SELECT
        COALESCE(SUM(sa.primary_amt), 0)::numeric   AS primary_amt,
        COALESCE(SUM(sa.primary_lines), 0)::bigint  AS primary_lines,
        COALESCE(SUM(sa.comp_amt), 0)::numeric      AS comp_amt,
        COALESCE(SUM(sa.comp_lines), 0)::bigint     AS comp_lines,
        COALESCE(SUM(sa.container_amt), 0)::numeric AS container_amt,
        COALESCE(SUM(sa.warehouse_amt), 0)::numeric AS warehouse_amt
      FROM sales_agg sa
      WHERE NOT EXISTS (SELECT 1 FROM roster r WHERE r.cust_key = sa.cust_key)
    ),
    unmatched_open_so AS (
      SELECT COALESCE(SUM(os.open_so_value), 0)::numeric AS open_so_value
      FROM open_so_agg os
      WHERE NOT EXISTS (SELECT 1 FROM roster r WHERE r.cust_key = os.cust_key)
    ),
    -- New for FIX 2: rows whose TRANSACTION rep matches the effective scope
    -- but whose customer doesn't resolve into that scope's roster.
    rep_scope_mismatch_src AS (
      SELECT
        lower(trim(a.customer_id::text)) AS cust_key,
        a.amount,
        a.fulfillment_type,
        a.transaction_date
      FROM public.v_companywide_reporting_actuals a
      WHERE a.metric_type = p_metric
        AND a.transaction_date >= LEAST(p_from, COALESCE(p_comp_from, p_from))
        AND a.transaction_date <= GREATEST(p_to, COALESCE(p_comp_to, p_to))
        AND v_effective_rep_ids IS NOT NULL
        AND NULLIF(TRIM(a.rep_id::text), '') IS NOT NULL
        AND lower(TRIM(a.rep_id::text)) = ANY(v_effective_rep_ids)
        AND (p_manager_id IS NULL OR a.manager_id = p_manager_id)
        AND (p_brand_cats IS NULL
             OR array_length(p_brand_cats, 1) IS NULL
             OR COALESCE(a.brand_category,
                  CASE WHEN p_metric = 'invoiced' THEN 'Historical Invoice' ELSE '' END
                ) = ANY(p_brand_cats))
        AND (p_skus IS NULL OR array_length(p_skus, 1) IS NULL OR a.sku = ANY(p_skus))
    ),
    rep_scope_mismatch_agg AS (
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE transaction_date BETWEEN p_from AND p_to), 0)::numeric   AS primary_amt,
        COALESCE(COUNT(*)    FILTER (WHERE transaction_date BETWEEN p_from AND p_to), 0)::bigint    AS primary_lines,
        COALESCE(SUM(amount) FILTER (WHERE p_comp_from IS NOT NULL AND transaction_date BETWEEN p_comp_from AND p_comp_to), 0)::numeric AS comp_amt,
        COALESCE(COUNT(*)    FILTER (WHERE p_comp_from IS NOT NULL AND transaction_date BETWEEN p_comp_from AND p_comp_to), 0)::bigint  AS comp_lines,
        COALESCE(SUM(amount) FILTER (WHERE transaction_date BETWEEN p_from AND p_to AND fulfillment_type = 'container'), 0)::numeric   AS container_amt,
        COALESCE(SUM(amount) FILTER (WHERE transaction_date BETWEEN p_from AND p_to AND fulfillment_type = 'warehouse'), 0)::numeric   AS warehouse_amt
      FROM rep_scope_mismatch_src s
      WHERE NOT EXISTS (SELECT 1 FROM roster r WHERE r.cust_key = s.cust_key)
    ),
    rep_scope_mismatch_open_so AS (
      SELECT COALESCE(SUM(o.open_so_amount), 0)::numeric AS open_so_value
      FROM public.v_portal_open_sales_order_line_facts o
      WHERE v_effective_rep_ids IS NOT NULL
        AND NULLIF(TRIM(o.customer_id::text), '') IS NOT NULL
        AND NULLIF(TRIM(o.rep_id::text), '') IS NOT NULL
        AND lower(TRIM(o.rep_id::text)) = ANY(v_effective_rep_ids)
        AND (p_manager_id IS NULL OR o.manager_id = p_manager_id)
        AND NOT EXISTS (SELECT 1 FROM roster r WHERE r.cust_key = lower(trim(o.customer_id::text)))
    )
    SELECT
      COALESCE(sa.orig_customer_id, r.ac_id)::text                AS entity_key,
      r.name::text                                                 AS entity_label,
      COALESCE(sa.primary_amt, 0)::numeric                        AS primary_amt,
      COALESCE(sa.primary_lines, 0)::bigint                       AS primary_lines,
      COALESCE(sa.comp_amt, 0)::numeric                           AS comp_amt,
      COALESCE(sa.comp_lines, 0)::bigint                          AS comp_lines,
      COALESCE(sa.container_amt, 0)::numeric                      AS container_amt,
      COALESCE(sa.warehouse_amt, 0)::numeric                      AS warehouse_amt,
      r.ac_id::text                                                AS customer_id,
      r.rep_display_name::text                                    AS rep_name,
      r.territory_name::text                                      AS territory_name,
      r.manager_name::text                                        AS manager_name,
      COALESCE(os.open_so_value, 0)::numeric                      AS open_so_value
    FROM roster r
    LEFT JOIN sales_agg sa   ON sa.cust_key = r.cust_key
    LEFT JOIN open_so_agg os ON os.cust_key = r.cust_key

    UNION ALL

    -- Unmatched / Unassigned Dealer — company-wide unfiltered view only
    -- (unchanged from before).
    SELECT
      'UNASSIGNED_DEALER'::text                                   AS entity_key,
      'Unmatched / Unassigned Dealer'::text                       AS entity_label,
      ua.primary_amt, ua.primary_lines, ua.comp_amt, ua.comp_lines,
      ua.container_amt, ua.warehouse_amt,
      NULL::text                                                   AS customer_id,
      NULL::text                                                   AS rep_name,
      NULL::text                                                   AS territory_name,
      NULL::text                                                   AS manager_name,
      uos.open_so_value
    FROM unmatched_agg ua, unmatched_open_so uos
    WHERE p_customer_ids       IS NULL
      AND v_effective_rep_ids  IS NULL
      AND p_manager_id         IS NULL
      AND (ua.primary_amt != 0 OR ua.comp_amt != 0 OR uos.open_so_value != 0)

    UNION ALL

    -- FIX 2: Unmatched / Roster Mismatch Dealer — rep-scoped views only.
    SELECT
      'REP_SCOPE_MISMATCH'::text                                  AS entity_key,
      'Unmatched / Roster Mismatch Dealer'::text                  AS entity_label,
      rma.primary_amt, rma.primary_lines, rma.comp_amt, rma.comp_lines,
      rma.container_amt, rma.warehouse_amt,
      NULL::text                                                   AS customer_id,
      NULL::text                                                   AS rep_name,
      NULL::text                                                   AS territory_name,
      NULL::text                                                   AS manager_name,
      rmos.open_so_value
    FROM rep_scope_mismatch_agg rma, rep_scope_mismatch_open_so rmos
    WHERE p_customer_ids      IS NULL
      AND v_effective_rep_ids IS NOT NULL
      AND (rma.primary_amt != 0 OR rma.comp_amt != 0 OR rmos.open_so_value != 0)

    ORDER BY 3 DESC NULLS LAST;

  ELSE
    RETURN QUERY
    WITH src AS (
      SELECT
        COALESCE(NULLIF(TRIM(a.rep_id::text), ''), NULLIF(TRIM(a.rep_name::text), ''), 'Unassigned') AS entity_key,
        COALESCE(
          NULLIF(TRIM(a.canonical_rep_name::text), ''),
          NULLIF(TRIM(a.rep_name::text),           ''),
          NULLIF(TRIM(a.rep_id::text),             ''),
          'Unassigned'
        ) AS entity_label,
        a.amount,
        a.fulfillment_type,
        a.transaction_date
      FROM public.v_companywide_reporting_actuals a
      WHERE a.metric_type = p_metric
        AND a.transaction_date >= LEAST(p_from, COALESCE(p_comp_from, p_from))
        AND a.transaction_date <= GREATEST(p_to, COALESCE(p_comp_to, p_to))
        AND (p_manager_id IS NULL OR a.manager_id = p_manager_id)
        AND (p_customer_ids IS NULL OR lower(a.customer_id::text) = ANY(p_customer_ids))
        AND (p_brand_cats IS NULL
             OR array_length(p_brand_cats, 1) IS NULL
             OR COALESCE(a.brand_category,
                  CASE WHEN p_metric = 'invoiced' THEN 'Historical Invoice' ELSE '' END
                ) = ANY(p_brand_cats))
        AND (p_skus IS NULL OR array_length(p_skus, 1) IS NULL OR a.sku = ANY(p_skus))
        AND (v_effective_rep_ids IS NULL
             OR (NULLIF(TRIM(a.rep_id::text), '') IS NOT NULL
                 AND lower(TRIM(a.rep_id::text)) = ANY(v_effective_rep_ids)))
    ),
    src_agg AS (
      SELECT
        s.entity_key,
        MAX(s.entity_label)::text                                                                      AS entity_label,
        COALESCE(SUM(s.amount) FILTER (WHERE s.transaction_date BETWEEN p_from AND p_to), 0)::numeric   AS primary_amt,
        COALESCE(COUNT(*)      FILTER (WHERE s.transaction_date BETWEEN p_from AND p_to), 0)::bigint    AS primary_lines,
        COALESCE(SUM(s.amount) FILTER (WHERE p_comp_from IS NOT NULL AND s.transaction_date BETWEEN p_comp_from AND p_comp_to), 0)::numeric AS comp_amt,
        COALESCE(COUNT(*)      FILTER (WHERE p_comp_from IS NOT NULL AND s.transaction_date BETWEEN p_comp_from AND p_comp_to), 0)::bigint  AS comp_lines,
        COALESCE(SUM(s.amount) FILTER (WHERE s.transaction_date BETWEEN p_from AND p_to AND s.fulfillment_type = 'container'), 0)::numeric   AS container_amt,
        COALESCE(SUM(s.amount) FILTER (WHERE s.transaction_date BETWEEN p_from AND p_to AND s.fulfillment_type = 'warehouse'), 0)::numeric   AS warehouse_amt
      FROM src s
      GROUP BY s.entity_key
    ),
    open_so_agg AS (
      SELECT
        COALESCE(NULLIF(TRIM(o.rep_id::text), ''), NULLIF(TRIM(o.rep_name::text), ''), 'Unassigned') AS entity_key,
        MAX(NULLIF(TRIM(o.rep_name::text), '')) AS rep_name_fallback,
        SUM(o.open_so_amount) AS open_so_value
      FROM public.v_portal_open_sales_order_line_facts o
      WHERE (p_manager_id IS NULL OR o.manager_id = p_manager_id)
        AND (v_effective_rep_ids IS NULL
             OR (NULLIF(TRIM(o.rep_id::text), '') IS NOT NULL
                 AND lower(TRIM(o.rep_id::text)) = ANY(v_effective_rep_ids)))
      GROUP BY 1
    ),
    all_keys AS (
      SELECT src_agg.entity_key FROM src_agg
      UNION
      SELECT open_so_agg.entity_key FROM open_so_agg
    )
    SELECT
      k.entity_key,
      COALESCE(sa.entity_label, os.rep_name_fallback, k.entity_key)::text                             AS entity_label,
      COALESCE(sa.primary_amt, 0)::numeric                                                             AS primary_amt,
      COALESCE(sa.primary_lines, 0)::bigint                                                            AS primary_lines,
      COALESCE(sa.comp_amt, 0)::numeric                                                                AS comp_amt,
      COALESCE(sa.comp_lines, 0)::bigint                                                                AS comp_lines,
      COALESCE(sa.container_amt, 0)::numeric                                                           AS container_amt,
      COALESCE(sa.warehouse_amt, 0)::numeric                                                           AS warehouse_amt,
      NULL::text    AS customer_id,
      NULL::text    AS rep_name,
      NULL::text    AS territory_name,
      NULL::text    AS manager_name,
      COALESCE(os.open_so_value, 0)::numeric                                                           AS open_so_value
    FROM all_keys k
    LEFT JOIN src_agg    sa ON sa.entity_key = k.entity_key
    LEFT JOIN open_so_agg os ON os.entity_key = k.entity_key
    WHERE COALESCE(sa.primary_amt, 0) != 0
       OR COALESCE(sa.comp_amt, 0) != 0
       OR COALESCE(os.open_so_value, 0) != 0
    ORDER BY 3 DESC NULLS LAST;
  END IF;
END;
$function$;

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- select round(sum(primary_amt),2) from get_sales_reporting_grouped_rows(
--   'invoiced','dealer','2026-07-01','2026-09-14',NULL,NULL,NULL,NULL,NULL,
--   ARRAY['shin','shin2'], NULL);
-- -- expect 129213.91, matching Rep Reporting exactly
--
-- select entity_label, primary_amt from get_sales_reporting_grouped_rows(
--   'invoiced','dealer','2026-07-01','2026-09-14',NULL,NULL,NULL,NULL,NULL,
--   ARRAY['shin','shin2'], NULL)
-- where entity_key = 'REP_SCOPE_MISMATCH';
-- -- expect no row (or $0) now that the 5 dealers are fixed - the bucket
-- -- exists but has nothing left to catch for Jordan specifically
--
-- select round(sum(primary_amt),2) from get_sales_reporting_grouped_rows(
--   'invoiced','dealer','2020-01-01','2030-12-31',NULL,NULL,NULL,NULL,NULL,NULL,NULL);
-- -- admin/unfiltered total unchanged from before this migration
-- ══════════════════════════════════════════════════════════════════════════════
