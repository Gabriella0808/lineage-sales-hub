-- Dealer Reporting (get_sales_reporting_grouped_rows, 'dealer' branch only):
-- the full_roster CTE was sourcing territory/manager display names through
-- FK joins to public.territories/public.managers, PLUS a LATERAL fallback
-- that borrowed territory/manager from a different dealers row sharing the
-- same name when the dealer's own row had neither. That fallback could pull
-- metadata from an inactive/duplicate/non-Acctivate-sourced sibling row.
--
-- Per the now-final rule: only a dealer's own active, source='acctivate' row
-- (with a real, non-null, non-UUID, non-ChIJ% acctivate_id) is a valid
-- metadata source - no name-based borrowing from any other row, active or
-- not. This replaces the territory_id/manager_id FK joins and the LATERAL
-- fb/t_fb/m_fb fallback with the dealer's own raw d.territory/d.sales_manager
-- text columns (the same columns Acctivate itself populates and that the
-- FK-based territory_id/manager_id are themselves derived from).
--
-- Dry-run verified before applying (see chat): roster row count unchanged
-- (674 -> 674), identical cust_key set both ways (no dealer gained or lost),
-- identical invoiced/booking totals for Jordan's Furniture, Belfort Furniture,
-- Coco Island Furniture, More Space Place - Sarasota, and Naples Furniture
-- Liquidators under old vs new logic. The only 6 rows that differ anywhere
-- in the roster: 3 are cosmetic (raw text "Will"/"Mateo" vs the FK-resolved
-- full name "Will Grisack"/"Mateo De Lisa" - same underlying record), and 3
-- are the exact risk this fix removes (Magnolia & Pine, The Special Touch,
-- Weinberger's Furniture - each previously borrowed a territory/manager
-- from an unrelated same-name duplicate row; each has no territory/manager
-- of its own, so they now correctly show null instead of a borrowed value).
--
-- get_sales_reporting_detail_lines was checked and needs no change - it has
-- no territory/manager columns and no public.dealers join at all.
--
-- The 'rep' grouping branch (p_group_by != 'dealer') has no dealer-metadata
-- join and is untouched. All other CTEs (sales_agg, rep_filtered_agg,
-- open_so_agg, the unrostered/unmatched/rep_scope_mismatch unions, ordering)
-- are byte-identical to the live function - only full_roster changed.

CREATE OR REPLACE FUNCTION public.get_sales_reporting_grouped_rows(p_metric text, p_group_by text, p_from date, p_to date, p_comp_from date DEFAULT NULL::date, p_comp_to date DEFAULT NULL::date, p_customer_ids text[] DEFAULT NULL::text[], p_brand_cats text[] DEFAULT NULL::text[], p_collections text[] DEFAULT NULL::text[], p_skus text[] DEFAULT NULL::text[], p_rep_ids text[] DEFAULT NULL::text[], p_manager_id uuid DEFAULT NULL::uuid)
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
    WITH full_roster AS (
      SELECT
        d.acctivate_id                                  AS ac_id,
        lower(trim(d.acctivate_id))                      AS cust_key,
        d.name,
        sr.acctivate_id                                  AS rep_ac_id,
        COALESCE(sr.name, d.salesperson)                 AS rep_display_name,
        d.territory                                      AS territory_name,
        d.sales_manager                                  AS manager_name
      FROM public.dealers d
      LEFT JOIN public.sales_reps sr  ON sr.id = d.rep_id
      WHERE d.source = 'acctivate'
        AND d.status = 'active'
        AND (NULLIF(TRIM(d.salesperson), '') IS NOT NULL OR NULLIF(TRIM(d.territory), '') IS NOT NULL)
        AND NULLIF(TRIM(d.acctivate_id), '') IS NOT NULL
        AND d.acctivate_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND d.acctivate_id NOT LIKE 'ChIJ%'
        AND (p_customer_ids IS NULL OR lower(trim(d.acctivate_id)) = ANY(p_customer_ids))
        AND (p_manager_id IS NULL OR d.manager_id = p_manager_id)
    ),
    sales_src AS (
      SELECT
        lower(trim(a.customer_id::text)) AS cust_key,
        a.customer_id,
        a.dealer_name,
        COALESCE(
          NULLIF(TRIM(a.canonical_rep_name::text), ''),
          NULLIF(TRIM(a.rep_name::text),           ''),
          NULLIF(TRIM(a.rep_id::text),             ''),
          'Unassigned'
        ) AS txn_rep_label,
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
        AND (p_collections IS NULL OR array_length(p_collections, 1) IS NULL OR a.product_class = ANY(p_collections))
    ),
    sales_agg AS (
      SELECT
        cust_key,
        MAX(sales_src.customer_id::text)                                                             AS orig_customer_id,
        MAX(sales_src.dealer_name::text)                                                              AS dealer_name,
        string_agg(DISTINCT txn_rep_label, ', ' ORDER BY txn_rep_label)                               AS txn_rep_names,
        COALESCE(SUM(amount) FILTER (WHERE transaction_date BETWEEN p_from AND p_to), 0)::numeric   AS primary_amt,
        COALESCE(COUNT(*)    FILTER (WHERE transaction_date BETWEEN p_from AND p_to), 0)::bigint    AS primary_lines,
        COALESCE(SUM(amount) FILTER (WHERE p_comp_from IS NOT NULL AND transaction_date BETWEEN p_comp_from AND p_comp_to), 0)::numeric AS comp_amt,
        COALESCE(COUNT(*)    FILTER (WHERE p_comp_from IS NOT NULL AND transaction_date BETWEEN p_comp_from AND p_comp_to), 0)::bigint  AS comp_lines,
        COALESCE(SUM(amount) FILTER (WHERE transaction_date BETWEEN p_from AND p_to AND fulfillment_type = 'container'), 0)::numeric   AS container_amt,
        COALESCE(SUM(amount) FILTER (WHERE transaction_date BETWEEN p_from AND p_to AND fulfillment_type = 'warehouse'), 0)::numeric   AS warehouse_amt
      FROM sales_src
      GROUP BY cust_key
    ),
    rep_filtered_src AS (
      SELECT
        lower(trim(a.customer_id::text)) AS cust_key,
        a.customer_id,
        a.dealer_name,
        a.amount,
        a.fulfillment_type,
        a.transaction_date,
        COALESCE(
          NULLIF(TRIM(a.canonical_rep_name::text), ''),
          NULLIF(TRIM(a.rep_name::text),           ''),
          NULLIF(TRIM(a.rep_id::text),             ''),
          'Unassigned'
        ) AS txn_rep_label
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
        AND (p_collections IS NULL OR array_length(p_collections, 1) IS NULL OR a.product_class = ANY(p_collections))
    ),
    rep_filtered_agg AS (
      SELECT
        cust_key,
        MAX(rep_filtered_src.customer_id::text)                                                      AS orig_customer_id,
        MAX(rep_filtered_src.dealer_name::text)                                                       AS dealer_name,
        string_agg(DISTINCT txn_rep_label, ', ' ORDER BY txn_rep_label)                               AS txn_rep_names,
        COALESCE(SUM(amount) FILTER (WHERE transaction_date BETWEEN p_from AND p_to), 0)::numeric   AS primary_amt,
        COALESCE(COUNT(*)    FILTER (WHERE transaction_date BETWEEN p_from AND p_to), 0)::bigint    AS primary_lines,
        COALESCE(SUM(amount) FILTER (WHERE p_comp_from IS NOT NULL AND transaction_date BETWEEN p_comp_from AND p_comp_to), 0)::numeric AS comp_amt,
        COALESCE(COUNT(*)    FILTER (WHERE p_comp_from IS NOT NULL AND transaction_date BETWEEN p_comp_from AND p_comp_to), 0)::bigint  AS comp_lines,
        COALESCE(SUM(amount) FILTER (WHERE transaction_date BETWEEN p_from AND p_to AND fulfillment_type = 'container'), 0)::numeric   AS container_amt,
        COALESCE(SUM(amount) FILTER (WHERE transaction_date BETWEEN p_from AND p_to AND fulfillment_type = 'warehouse'), 0)::numeric   AS warehouse_amt
      FROM rep_filtered_src
      GROUP BY cust_key
    ),
    open_so_agg AS (
      SELECT lower(trim(o.customer_id::text)) AS cust_key, SUM(o.open_so_amount) AS open_so_value
      FROM public.v_portal_open_sales_order_line_facts o
      WHERE NULLIF(TRIM(o.customer_id::text), '') IS NOT NULL
      GROUP BY 1
    ),
    unrostered_sales_agg AS (
      SELECT sa.*
      FROM sales_agg sa
      WHERE sa.cust_key IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM full_roster r WHERE r.cust_key = sa.cust_key)
    ),
    unrostered_rep_filtered_agg AS (
      SELECT rfa.*
      FROM rep_filtered_agg rfa
      WHERE rfa.cust_key IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM full_roster r WHERE r.cust_key = rfa.cust_key)
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
      WHERE sa.cust_key IS NULL
    ),
    unmatched_open_so AS (
      SELECT COALESCE(SUM(os.open_so_value), 0)::numeric AS open_so_value
      FROM open_so_agg os
      WHERE NOT EXISTS (SELECT 1 FROM full_roster r WHERE r.cust_key = os.cust_key)
        AND NOT EXISTS (SELECT 1 FROM unrostered_sales_agg ur WHERE ur.cust_key = os.cust_key)
    ),
    rep_scope_mismatch_agg AS (
      SELECT
        COALESCE(SUM(rfa.primary_amt), 0)::numeric   AS primary_amt,
        COALESCE(SUM(rfa.primary_lines), 0)::bigint  AS primary_lines,
        COALESCE(SUM(rfa.comp_amt), 0)::numeric      AS comp_amt,
        COALESCE(SUM(rfa.comp_lines), 0)::bigint     AS comp_lines,
        COALESCE(SUM(rfa.container_amt), 0)::numeric AS container_amt,
        COALESCE(SUM(rfa.warehouse_amt), 0)::numeric AS warehouse_amt
      FROM rep_filtered_agg rfa
      WHERE rfa.cust_key IS NULL
    ),
    rep_scope_mismatch_open_so AS (
      SELECT COALESCE(SUM(o.open_so_amount), 0)::numeric AS open_so_value
      FROM public.v_portal_open_sales_order_line_facts o
      WHERE v_effective_rep_ids IS NOT NULL
        AND NULLIF(TRIM(o.customer_id::text), '') IS NOT NULL
        AND NULLIF(TRIM(o.rep_id::text), '') IS NOT NULL
        AND lower(TRIM(o.rep_id::text)) = ANY(v_effective_rep_ids)
        AND (p_manager_id IS NULL OR o.manager_id = p_manager_id)
        AND NOT EXISTS (SELECT 1 FROM full_roster r WHERE r.cust_key = lower(trim(o.customer_id::text)))
        AND NOT EXISTS (SELECT 1 FROM unrostered_rep_filtered_agg ur WHERE ur.cust_key = lower(trim(o.customer_id::text)))
    )
    SELECT
      COALESCE(sa.orig_customer_id, rfa.orig_customer_id, fr.ac_id)::text  AS entity_key,
      fr.name::text                                                        AS entity_label,
      COALESCE(CASE WHEN v_effective_rep_ids IS NOT NULL THEN rfa.primary_amt   ELSE sa.primary_amt   END, 0)::numeric AS primary_amt,
      COALESCE(CASE WHEN v_effective_rep_ids IS NOT NULL THEN rfa.primary_lines ELSE sa.primary_lines END, 0)::bigint  AS primary_lines,
      COALESCE(CASE WHEN v_effective_rep_ids IS NOT NULL THEN rfa.comp_amt      ELSE sa.comp_amt      END, 0)::numeric AS comp_amt,
      COALESCE(CASE WHEN v_effective_rep_ids IS NOT NULL THEN rfa.comp_lines    ELSE sa.comp_lines    END, 0)::bigint  AS comp_lines,
      COALESCE(CASE WHEN v_effective_rep_ids IS NOT NULL THEN rfa.container_amt ELSE sa.container_amt END, 0)::numeric AS container_amt,
      COALESCE(CASE WHEN v_effective_rep_ids IS NOT NULL THEN rfa.warehouse_amt ELSE sa.warehouse_amt END, 0)::numeric AS warehouse_amt,
      fr.ac_id::text                                                        AS customer_id,
      fr.rep_display_name::text                                            AS rep_name,
      fr.territory_name::text                                              AS territory_name,
      fr.manager_name::text                                                AS manager_name,
      COALESCE(os.open_so_value, 0)::numeric                               AS open_so_value
    FROM full_roster fr
    LEFT JOIN sales_agg sa         ON v_effective_rep_ids IS NULL     AND sa.cust_key  = fr.cust_key
    LEFT JOIN rep_filtered_agg rfa ON v_effective_rep_ids IS NOT NULL AND rfa.cust_key = fr.cust_key
    LEFT JOIN open_so_agg os       ON os.cust_key = fr.cust_key
    WHERE
      v_effective_rep_ids IS NULL
      OR (NULLIF(TRIM(fr.rep_ac_id), '') IS NOT NULL AND lower(TRIM(fr.rep_ac_id)) = ANY(v_effective_rep_ids))
      OR rfa.cust_key IS NOT NULL

    UNION ALL

    SELECT
      ur.orig_customer_id::text                                   AS entity_key,
      ur.dealer_name::text                                        AS entity_label,
      ur.primary_amt, ur.primary_lines, ur.comp_amt, ur.comp_lines,
      ur.container_amt, ur.warehouse_amt,
      ur.orig_customer_id::text                                   AS customer_id,
      NULL::text                                                   AS rep_name,
      NULL::text                                                   AS territory_name,
      NULL::text                                                   AS manager_name,
      COALESCE(os2.open_so_value, 0)::numeric                     AS open_so_value
    FROM unrostered_sales_agg ur
    LEFT JOIN open_so_agg os2 ON os2.cust_key = ur.cust_key
    WHERE v_effective_rep_ids IS NULL
      AND p_manager_id IS NULL
      AND (p_customer_ids IS NULL OR ur.cust_key = ANY(p_customer_ids))

    UNION ALL

    SELECT
      ur2.orig_customer_id::text                                  AS entity_key,
      ur2.dealer_name::text                                       AS entity_label,
      ur2.primary_amt, ur2.primary_lines, ur2.comp_amt, ur2.comp_lines,
      ur2.container_amt, ur2.warehouse_amt,
      ur2.orig_customer_id::text                                  AS customer_id,
      NULL::text                                                   AS rep_name,
      NULL::text                                                   AS territory_name,
      NULL::text                                                   AS manager_name,
      COALESCE(os3.open_so_value, 0)::numeric                     AS open_so_value
    FROM unrostered_rep_filtered_agg ur2
    LEFT JOIN open_so_agg os3 ON os3.cust_key = ur2.cust_key
    WHERE v_effective_rep_ids IS NOT NULL
      AND p_manager_id IS NULL
      AND (p_customer_ids IS NULL OR ur2.cust_key = ANY(p_customer_ids))

    UNION ALL

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
        AND (p_collections IS NULL OR array_length(p_collections, 1) IS NULL OR a.product_class = ANY(p_collections))
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

-- Drop the temporary dry-run comparison function used to validate this
-- change before applying it for real.
DROP FUNCTION IF EXISTS public.get_sales_reporting_grouped_rows_dryrun(text, text, date, date, date, date, text[], text[], text[], text[], text[], uuid);
