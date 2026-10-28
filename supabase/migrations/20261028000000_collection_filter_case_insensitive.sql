-- Bug fix: the Collection filter on Company-Wide / Dealer / Rep
-- Reporting returned no figures for any collection.
--
-- The filter sends UPPERCASE Acctivate codes from
-- v_active_acctivate_collection_codes (e.g. 'ISLAMORA', 'ISLAMORADA' -
-- see useActiveCollectionCodes + SalesReporting.tsx collectionGroups),
-- but v_companywide_reporting_actuals.product_class is Title Case
-- ('Islamorada', 'Cabinet Beds', ...). The RPCs compared them with a
-- case-sensitive `a.product_class = ANY(p_collections)`, so nothing
-- ever matched (confirmed live: 0 rows vs 2,956 case-insensitively for
-- Islamorada alone).
--
-- Fix: compare on upper(trim(product_class)) - the same normalisation
-- the frontend already applies when building the option list. Function
-- bodies below are the live definitions (pg_get_functiondef) with only
-- those comparisons changed.

BEGIN;

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
    WHEN public.is_admin() OR public.current_manager_id() IS NOT NULL OR public.has_effective_role(auth.uid(), 'manager') THEN p_rep_ids
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
        AND (p_collections IS NULL OR array_length(p_collections, 1) IS NULL OR upper(trim(a.product_class)) = ANY(p_collections))
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
        AND (p_collections IS NULL OR array_length(p_collections, 1) IS NULL OR upper(trim(a.product_class)) = ANY(p_collections))
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
        AND (p_collections IS NULL OR array_length(p_collections, 1) IS NULL OR upper(trim(a.product_class)) = ANY(p_collections))
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
$function$

;

CREATE OR REPLACE FUNCTION public.get_sales_reporting_detail_lines(p_metric text, p_group_by text, p_entity_key text, p_from date, p_to date, p_customer_ids text[] DEFAULT NULL::text[], p_brand_cats text[] DEFAULT NULL::text[], p_collections text[] DEFAULT NULL::text[], p_skus text[] DEFAULT NULL::text[], p_rep_ids text[] DEFAULT NULL::text[], p_limit integer DEFAULT 200, p_offset integer DEFAULT 0, p_manager_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(transaction_date date, invoice_number text, dealer_name text, rep_name text, rep_id text, customer_id text, sku text, description text, brand_category text, product_class text, amount numeric, invoice_type text, fulfillment_type text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dealer_match text;
  v_effective_rep_ids text[];
BEGIN
  v_effective_rep_ids := CASE
    WHEN public.is_admin() OR public.current_manager_id() IS NOT NULL OR public.has_effective_role(auth.uid(), 'manager') THEN p_rep_ids
    WHEN public.current_rep_acctivate_ids() IS NOT NULL THEN public.current_rep_acctivate_ids()
    ELSE ARRAY['__no_rep_mapped__']
  END;

  IF p_group_by = 'dealer' AND p_entity_key = 'UNASSIGNED_DEALER' THEN
    IF v_effective_rep_ids IS NOT NULL THEN
      RETURN; -- this bucket only exists in the fully unscoped (staff, unfiltered) view
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
  ELSIF p_group_by = 'dealer' AND p_entity_key = 'REP_SCOPE_MISMATCH' THEN
    IF v_effective_rep_ids IS NULL THEN
      RETURN; -- this bucket only exists in rep-scoped views
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
      AND (%14$L::text[] IS NULL
           OR array_length(%14$L::text[], 1) IS NULL
           OR upper(trim(a.product_class)) = ANY(%14$L::text[]))
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
    v_effective_rep_ids,
    p_limit, p_offset,
    v_dealer_match,
    p_collections
  );
END;
$function$

;

COMMIT;
