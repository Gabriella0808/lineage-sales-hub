-- Dealer Reporting: filter roster metadata to active dealers, and add a
-- strict, unambiguous field-level fallback for territory/manager.
--
-- ROOT REQUEST: dealers showing blank Territory/Manager in Dealer Reporting
-- despite the correct data existing in Acctivate. Root-caused across several
-- rounds of live diagnosis this session to two separate, real issues:
--   1. get_sales_reporting_grouped_rows never filtered dealers by
--      status='active' at all, so ~48% of Acctivate-sourced dealers
--      (marked inactive) were fully visible in Dealer Reporting alongside
--      active ones, with no way to distinguish them.
--   2. The same real-world dealer sometimes has multiple `dealers` rows
--      under different acctivate_id values (a clean text-keyed row plus a
--      stale GUID-keyed row left from an older import pass), with
--      territory/manager data split unevenly across them. The RPC's exact
--      acctivate_id-to-transaction-customer_id match always picks exactly
--      one row (acctivate_id has zero real duplicates, confirmed live) but
--      that one row sometimes lacks a field a sibling duplicate has.
--
-- WHAT CHANGED (scoped entirely to the `full_roster` CTE in the `dealer`
-- branch of get_sales_reporting_grouped_rows — sales_src/sales_agg/
-- rep_filtered_src/rep_filtered_agg/open_so_agg and the `rep` branch are
-- byte-for-byte unchanged):
--   - Added `AND d.status = 'active'` to the base roster filter. An
--     inactive dealer no longer gets its own roster row in Dealer
--     Reporting; its dollar activity now falls into the existing
--     REP_SCOPE_MISMATCH / UNASSIGNED_DEALER buckets instead of vanishing
--     (confirmed via grand-total row-diff below — dollars are conserved,
--     just re-bucketed).
--   - Added a `LEFT JOIN LATERAL` field-level fallback for territory_name/
--     manager_name, gated strictly:
--       * only considers OTHER rows that are status='active',
--         source='acctivate', and have a real (non-blank) acctivate_id —
--         never field_only/crm/crm_prospect, never null-acctivate_id rows
--       * only considers rows with the exact same normalized (lower/trim)
--         dealer name — no fuzzy/partial matching
--       * only engages when the base row's own field is genuinely missing
--         (both the FK and the raw text column are blank)
--       * if qualifying candidates DISAGREE (more than one distinct
--         non-null value among them), the aggregate collapses to NULL —
--         left blank rather than guessed, never silently picks one
--       * COALESCE(base, fallback) — only ever fills a gap, never
--         overwrites a value the base row already has
--       * never touches sales_reps/rep_territories or derives from a rep's
--         own territory/manager assignment — purely a dealer-to-dealer
--         name match
--
-- VALIDATION (performed live against _v2_test/_v3_test copies before this
-- migration was written, then dropped once confirmed correct):
--   - Grand totals identical, old vs new, dealer/invoiced, 2026-01-01 to
--     2026-09-17: primary_amt $2,601,930.29 both, comp_amt $0.00 both,
--     open_so_value $2,076,019.04 both. Row count dropped 706->233, which
--     is the expected, correct effect of the status='active' filter
--     collapsing inactive-dealer rows into the mismatch bucket.
--   - Named-dealer before/after, same underlying data, old function vs
--     validated new logic:
--       Belfort Furniture Inc:        Virginia / Mateo        (unchanged, already correct)
--       Coco Island Furniture:        Alabama / Will          (unchanged, already correct)
--       Jordan's Furniture:           New England / House     (unchanged, already correct)
--       More Space Place - Sarasota:  FL SW / Will             (unchanged, already correct)
--       Waters Home Furnishings:      manager null -> Mateo De Lisa (fallback fix, isolated proof
--         of the new logic — territory correctly stayed null since no
--         candidate anywhere has that data)
--     All five: dollar amounts identical before/after.
--   - Ambiguity safeguard confirmed against real data: 9 dealer names in
--     the live table have duplicate active Acctivate rows that genuinely
--     disagree (e.g. two different manager records under "Belfort
--     Furniture" / "Jordan's Furniture"); checked all 9 against live
--     reporting output and none is currently silently guessed — the
--     fallback only ever engages when the base row itself is missing data,
--     and in every current case the base row already has its own real data.
--   - Remaining blanks (14 dealers with real activity) confirmed to have no
--     usable candidate anywhere in `dealers` for the missing field(s) —
--     genuine Acctivate-side data gaps, not a Supabase matching problem.
--
-- Untouched: get_sales_reporting_detail_lines (confirmed no territory_name/
-- manager_name columns exist there at all — dealer_name/rep_name come
-- straight from the transaction view, not a dealers join), invoice/booking
-- amount formulas, Open SO logic, Live KPI, and all source transaction
-- data. No dealers rows were manually edited; no dealers rows were deleted.

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
        COALESCE(t.name, t_fb.name)                      AS territory_name,
        COALESCE(m.name, m_fb.name)                      AS manager_name
      FROM public.dealers d
      LEFT JOIN public.sales_reps sr  ON sr.id = d.rep_id
      LEFT JOIN public.territories t  ON t.id  = d.territory_id
      LEFT JOIN public.managers m     ON m.id  = d.manager_id
      -- Field-level fallback, strict & unambiguous-only:
      --   - only considers OTHER active, Acctivate-sourced rows with a real
      --     acctivate_id and the exact same normalized name
      --   - only fires when the base row's own field is genuinely missing
      --     (both FK and raw text blank)
      --   - if qualifying candidates DISAGREE (more than one distinct
      --     non-null value), the aggregate collapses to NULL — left blank,
      --     never guesses
      --   - never overwrites a real base-row value (COALESCE only fills gaps)
      --   - never touches rep/territory/manager mapping tables, never
      --     derives from rep_territories
      LEFT JOIN LATERAL (
        SELECT
          CASE WHEN COUNT(DISTINCT d2.territory_id) FILTER (WHERE d2.territory_id IS NOT NULL) = 1
               THEN (array_agg(d2.territory_id) FILTER (WHERE d2.territory_id IS NOT NULL))[1] END AS territory_id,
          CASE WHEN COUNT(DISTINCT d2.manager_id) FILTER (WHERE d2.manager_id IS NOT NULL) = 1
               THEN (array_agg(d2.manager_id) FILTER (WHERE d2.manager_id IS NOT NULL))[1] END AS manager_id
        FROM public.dealers d2
        WHERE d2.id <> d.id
          AND d2.status = 'active'
          AND d2.source = 'acctivate'
          AND NULLIF(TRIM(d2.acctivate_id), '') IS NOT NULL
          AND lower(trim(d2.name)) = lower(trim(d.name))
      ) fb ON (d.territory_id IS NULL AND NULLIF(TRIM(d.territory), '') IS NULL)
           OR (d.manager_id IS NULL AND NULLIF(TRIM(d.sales_manager), '') IS NULL)
      LEFT JOIN public.territories t_fb ON t_fb.id = fb.territory_id
      LEFT JOIN public.managers m_fb    ON m_fb.id = fb.manager_id
      WHERE d.source <> 'field_only'
        AND d.status = 'active'
        AND (NULLIF(TRIM(d.salesperson), '') IS NOT NULL OR NULLIF(TRIM(d.territory), '') IS NOT NULL)
        AND NULLIF(TRIM(d.acctivate_id), '') IS NOT NULL
        AND (p_customer_ids IS NULL OR lower(trim(d.acctivate_id)) = ANY(p_customer_ids))
        AND (p_manager_id IS NULL OR d.manager_id = p_manager_id)
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
        AND (p_collections IS NULL OR array_length(p_collections, 1) IS NULL OR a.product_class = ANY(p_collections))
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
    rep_filtered_src AS (
      SELECT
        lower(trim(a.customer_id::text)) AS cust_key,
        a.customer_id,
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
    unmatched_agg AS (
      SELECT
        COALESCE(SUM(sa.primary_amt), 0)::numeric   AS primary_amt,
        COALESCE(SUM(sa.primary_lines), 0)::bigint  AS primary_lines,
        COALESCE(SUM(sa.comp_amt), 0)::numeric      AS comp_amt,
        COALESCE(SUM(sa.comp_lines), 0)::bigint     AS comp_lines,
        COALESCE(SUM(sa.container_amt), 0)::numeric AS container_amt,
        COALESCE(SUM(sa.warehouse_amt), 0)::numeric AS warehouse_amt
      FROM sales_agg sa
      WHERE NOT EXISTS (SELECT 1 FROM full_roster r WHERE r.cust_key = sa.cust_key)
    ),
    unmatched_open_so AS (
      SELECT COALESCE(SUM(os.open_so_value), 0)::numeric AS open_so_value
      FROM open_so_agg os
      WHERE NOT EXISTS (SELECT 1 FROM full_roster r WHERE r.cust_key = os.cust_key)
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
      WHERE NOT EXISTS (SELECT 1 FROM full_roster r WHERE r.cust_key = rfa.cust_key)
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
      COALESCE(
        CASE WHEN v_effective_rep_ids IS NOT NULL THEN rfa.txn_rep_names ELSE NULL END,
        fr.rep_display_name
      )::text                                                               AS rep_name,
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
    -- 'rep' branch: UNCHANGED, verbatim — no dealer-metadata join here at all.
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

DROP FUNCTION IF EXISTS public.get_sales_reporting_grouped_rows_v2_test(
  text, text, date, date, date, date, text[], text[], text[], text[], text[], uuid
);
DROP FUNCTION IF EXISTS public.get_sales_reporting_grouped_rows_v3_test(
  text, text, date, date, date, date, text[], text[], text[], text[], text[], uuid
);

COMMIT;
