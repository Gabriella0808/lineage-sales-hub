-- ══════════════════════════════════════════════════════════════════════════════
-- Architectural change to rep-scoped Dealer Reporting, per explicit request:
-- dealer roster ownership must no longer be used to INCLUDE or EXCLUDE
-- transaction revenue when a rep filter is active. Going forward:
--
--   Rep filter for sales amounts = transaction-level rep_id (same predicate
--   Rep Reporting already uses), NOT dealer.rep_id / roster ownership.
--
-- Dealer roster is still used for: dealer name/display, customer_id/
-- acctivate_id matching, territory/manager display, and showing $0 rows for
-- dealers rostered to the selected rep with no recent activity. It is no
-- longer used to gate which transaction rows count toward a rep's total.
--
-- Effect: for a specific rep filter, a dealer whose roster says a different
-- rep owns it will now still appear (with its roster rep shown for
-- reference) whenever it has transactions actually coded to the selected
-- rep - and its dollar amount reflects only that rep's own coded lines, so
-- Dealer Reporting = Rep Reporting for every rep, every time. Example: with
-- Mike Durham selected, Lott's Furniture (roster: Bruce Quillen) now shows
-- under Mike Durham with his $8,664.60 in actual coded sales.
--
-- Unfiltered admin/manager Dealer Reporting is untouched: same dealers,
-- same grand total, same Unmatched/Unassigned Dealer bucket, byte-for-byte.
--
-- The rep-scoped "Unmatched / Roster Mismatch Dealer" bucket (added in an
-- earlier migration) is redefined to mean what its name says: transaction
-- rows coded to the selected rep whose customer_id doesn't match ANY
-- dealer record at all. Previously it also caught dealers that exist but
-- are rostered to someone else - those now show as normal named rows
-- instead, per the new model.
--
-- get_sales_reporting_detail_lines (the drawer) is simplified back to
-- applying the same rep filter unconditionally on transaction rows in both
-- dealer and rep modes (matching this new model exactly, so the drawer's
-- line-level total always equals the card total), and gains proper
-- handling for entity_key = 'REP_SCOPE_MISMATCH' so that bucket is now
-- drillable. The entity-level dealer-roster gate added in the prior
-- migration (20260914004000) is removed - it enforced the OLD "dealer
-- roster gates rep access" model, which this migration replaces.
--
-- No changes to: dealer.rep_id, dealer territory/manager, transaction
-- source data, invoice/booking amount formulas, Open SO calculation,
-- Live KPI, sync scripts, Labor Day Promo, Prospect Reporting. Manager-
-- scoped filtering (p_manager_id) is untouched - still dealer-roster based,
-- exactly as before; only rep scoping changes.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_sales_reporting_grouped_rows(
  p_metric text,
  p_group_by text,
  p_from date,
  p_to date,
  p_comp_from date DEFAULT NULL::date,
  p_comp_to date DEFAULT NULL::date,
  p_customer_ids text[] DEFAULT NULL::text[],
  p_brand_cats text[] DEFAULT NULL::text[],
  p_skus text[] DEFAULT NULL::text[],
  p_rep_ids text[] DEFAULT NULL::text[],
  p_manager_id uuid DEFAULT NULL::uuid
)
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
      -- ALL eligible dealers regardless of roster rep - manager/customer_id
      -- filtered only. Drives display (name/territory/manager/roster rep
      -- name) and $0 rows. Rep filtering no longer happens here.
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
    ),
    sales_src AS (
      -- Unfiltered by rep/manager. Drives the admin/unfiltered totals and
      -- the UNASSIGNED_DEALER bucket - unchanged from before.
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
    rep_filtered_src AS (
      -- NEW: transaction-level rows filtered by the SAME rep predicate Rep
      -- Reporting uses. This is now the source of truth for rep-scoped
      -- Dealer Reporting $ amounts, regardless of dealer roster ownership.
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
    rep_filtered_agg AS (
      SELECT
        cust_key,
        MAX(rep_filtered_src.customer_id::text)                                                      AS orig_customer_id,
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
      -- UNCHANGED
      SELECT lower(trim(o.customer_id::text)) AS cust_key, SUM(o.open_so_amount) AS open_so_value
      FROM public.v_portal_open_sales_order_line_facts o
      WHERE NULLIF(TRIM(o.customer_id::text), '') IS NOT NULL
      GROUP BY 1
    ),
    unmatched_agg AS (
      -- UNCHANGED: unfiltered-view-only bucket
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
      -- UNCHANGED
      SELECT COALESCE(SUM(os.open_so_value), 0)::numeric AS open_so_value
      FROM open_so_agg os
      WHERE NOT EXISTS (SELECT 1 FROM full_roster r WHERE r.cust_key = os.cust_key)
    ),
    rep_scope_mismatch_agg AS (
      -- REDEFINED: now genuinely "no dealer record matches this
      -- customer_id" (previously also caught dealers that exist but are
      -- rostered to a different rep - those are normal named rows now).
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
      -- UNCHANGED
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
      fr.rep_display_name::text                                            AS rep_name,
      fr.territory_name::text                                              AS territory_name,
      fr.manager_name::text                                                AS manager_name,
      COALESCE(os.open_so_value, 0)::numeric                               AS open_so_value
    FROM full_roster fr
    LEFT JOIN sales_agg sa         ON v_effective_rep_ids IS NULL     AND sa.cust_key  = fr.cust_key
    LEFT JOIN rep_filtered_agg rfa ON v_effective_rep_ids IS NOT NULL AND rfa.cust_key = fr.cust_key
    LEFT JOIN open_so_agg os       ON os.cust_key = fr.cust_key
    WHERE
      v_effective_rep_ids IS NULL                                                                       -- admin/unfiltered: every eligible dealer, as before
      OR (NULLIF(TRIM(fr.rep_ac_id), '') IS NOT NULL AND lower(TRIM(fr.rep_ac_id)) = ANY(v_effective_rep_ids))  -- this rep's own roster dealers (incl. $0)
      OR rfa.cust_key IS NOT NULL                                                                        -- any dealer with this rep's transaction-coded sales

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

    -- Unmatched / Roster Mismatch Dealer — rep-scoped views only. Now means
    -- exactly what its name says: no dealer record matches this
    -- customer_id at all.
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
    -- 'rep' branch: UNCHANGED, verbatim.
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
-- get_sales_reporting_detail_lines: simplified to match the new model.
-- The dealer-roster entity-level gate added in 20260914004000 is removed -
-- it enforced "dealer roster decides rep access," which this migration
-- replaces with "transaction rep_id decides rep access, everywhere,"
-- exactly like Rep Reporting already does. REP_SCOPE_MISMATCH is now a
-- valid, drillable entity_key (mirrors UNASSIGNED_DEALER's own predicate,
-- gated the opposite way round).
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
BEGIN
  v_effective_rep_ids := CASE
    WHEN public.is_admin() OR public.current_manager_id() IS NOT NULL THEN p_rep_ids
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
    v_dealer_match
  );
END;
$function$;

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION (run manually after push)
--
-- Admin unfiltered grand total unchanged:
-- select round(sum(primary_amt),2) from get_sales_reporting_grouped_rows(
--   'invoiced','dealer','2026-07-01', current_date, NULL,NULL,NULL,NULL,NULL,
--   NULL, NULL);
--
-- Per-rep Dealer Reporting vs Rep Reporting, invoices:
-- select round(sum(primary_amt),2) from get_sales_reporting_grouped_rows(
--   'invoiced','dealer','2026-07-01', current_date, NULL,NULL,NULL,NULL,NULL,
--   ARRAY['<code>'], NULL);
-- select round(sum(primary_amt),2) from get_sales_reporting_grouped_rows(
--   'invoiced','rep','2026-07-01', current_date, NULL,NULL,NULL,NULL,NULL,
--   ARRAY['<code>'], NULL);
--
-- Conflict dealers now appear under their actual transacting rep:
-- select entity_key, primary_amt from get_sales_reporting_grouped_rows(
--   'invoiced','dealer','2026-07-01', current_date, NULL,NULL,NULL,NULL,NULL,
--   ARRAY['md'], NULL) where entity_key ilike '%Lott%' or entity_key ilike '%Walker%';
-- ══════════════════════════════════════════════════════════════════════════════
