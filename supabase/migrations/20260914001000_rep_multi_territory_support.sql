-- ══════════════════════════════════════════════════════════════════════════════
-- Support a rep who legitimately covers more than one territory under
-- separate Acctivate codes — Jordan Shindell needs to see both "Shindell-
-- Beach" (acctivate_id 'Shin') and "Shindell - PA/OH" (acctivate_id 'Shin2'),
-- two distinct sales_reps rows for the same person (his actual bookings/
-- invoices/appointments are split across both codes at the transaction
-- level, so this can't be solved by just repointing his single mapping at a
-- different sales_reps row - he needs both).
--
-- user_reps currently has a PRIMARY KEY on user_id alone, so a user can only
-- ever have one row. Widened to (user_id, rep_id) so a user can be linked to
-- multiple sales_reps rows.
--
-- current_rep_id() (the PRE-EXISTING singular helper) is used by 19 RLS
-- policies across many tables outside this session's scope (travel_log,
-- tasks, kpi_records, dealer_invoices, open_sales_orders, territories,
-- rep_territories, dealer_sales(_lines), dealer_check_ins, rep_targets,
-- managers, sales_reps, trade_show_markets) that this migration does NOT
-- touch - none of them are used by the 5 rep-facing pages built this
-- session. Left as a bare (unaggregated) subquery, it would now throw
-- "more than one row returned by a subquery" for a multi-rep user like
-- Jordan the moment he touched any of those 19 policies. Fixed with LIMIT 1
-- so it degrades gracefully (arbitrarily picks one of his rep rows, same
-- single-territory limitation those 15+ untouched tables already had - not
-- worse, not fixed, just not broken).
--
-- New: current_rep_ids() (SETOF uuid, mirrors the existing
-- current_manager_rep_ids() convention) and current_rep_acctivate_ids()
-- (text[], mirrors last migration's now-removed singular
-- current_rep_acctivate_id()) - both return the FULL set for the caller.
-- Used to upgrade exactly the RLS/RPCs this session's rep-scoping work
-- introduced or directly depends on: the 5 reporting RPCs, market_appointments
-- (all 4 rep policies - read AND write, so Jordan can also create/edit leads
-- under either identity), dealers (SalesReporting.tsx's dealer list/filter
-- depends on this table's own RLS), and labor_day_2026_participants.
--
-- Untouched: all 19 policies on the other tables listed above, bookings/
-- invoice formulas, Live KPI/Dealer/Rep Reporting/Open SO/LD Promo
-- calculations, Acctivate sync scripts, dealer roster cleanup, territory
-- logic, admin/manager behavior (their p_rep_ids/p_manager_id pass through
-- exactly as before in every RPC below).
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Allow multiple user_reps rows per user ──────────────────────────────
ALTER TABLE public.user_reps DROP CONSTRAINT user_reps_pkey;
ALTER TABLE public.user_reps ADD PRIMARY KEY (user_id, rep_id);

-- ── 2. Make the pre-existing singular helper safe (LIMIT 1), unchanged for
--       every single-rep caller ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_rep_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT rep_id FROM public.user_reps WHERE user_id = auth.uid() LIMIT 1
$function$;

-- ── 3. New plural helpers ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_rep_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT rep_id FROM public.user_reps WHERE user_id = auth.uid()
$function$;

-- Must drop before the function it depends on (below).
DROP POLICY IF EXISTS "Staff or own rep read ld26 participants" ON public.labor_day_2026_participants;

DROP FUNCTION IF EXISTS public.current_rep_acctivate_id();

CREATE OR REPLACE FUNCTION public.current_rep_acctivate_ids()
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT array_agg(DISTINCT lower(trim(sr.acctivate_id)))
  FROM public.user_reps ur
  JOIN public.sales_reps sr ON sr.id = ur.rep_id
  WHERE ur.user_id = auth.uid()
    AND NULLIF(TRIM(sr.acctivate_id), '') IS NOT NULL
$function$;

-- ── 4. Upgrade the 5 reporting RPCs to the plural helper ────────────────────
-- Each function is byte-identical to its prior version except the single
-- CASE branch that was: `... THEN ARRAY[lower(trim(current_rep_acctivate_id()))]`
-- now reads the plural set directly.

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

CREATE OR REPLACE FUNCTION public.get_sales_reporting_detail_lines(p_metric text, p_group_by text, p_entity_key text, p_from date, p_to date, p_customer_ids text[] DEFAULT NULL::text[], p_brand_cats text[] DEFAULT NULL::text[], p_skus text[] DEFAULT NULL::text[], p_rep_ids text[] DEFAULT NULL::text[], p_limit integer DEFAULT 200, p_offset integer DEFAULT 0, p_manager_id uuid DEFAULT NULL::uuid)
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
RETURNS TABLE(
  guid_order text, order_number text, order_date date, requested_ship_date date,
  customer_id text, dealer_name text, rep_id text, rep_name text,
  fulfillment_type text, warehouse text, sku text, description text,
  product_class text, brand_category text, qty_ordered numeric, qty_shipped numeric,
  qty_open numeric, unit_price numeric, line_discount_pct numeric, net_open_amount numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH effective AS (
    SELECT CASE
      WHEN public.is_admin() OR public.current_manager_id() IS NOT NULL THEN p_rep_ids
      WHEN public.current_rep_acctivate_ids() IS NOT NULL THEN public.current_rep_acctivate_ids()
      ELSE ARRAY['__no_rep_mapped__']
    END AS rep_ids
  )
  SELECT
    a.guid_order, a.order_number, a.order_date, a.requested_ship_date,
    a.customer_id, a.dealer_name, a.rep_id, a.rep_name,
    a.fulfillment_type, a.warehouse, a.sku, a.description, a.product_class,
    a.brand_category, a.qty_ordered, a.qty_shipped, a.qty_open,
    a.unit_price, a.line_discount_pct, a.open_so_amount
  FROM public.v_portal_open_sales_order_line_facts a, effective
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
    AND (effective.rep_ids IS NULL
         OR (NULLIF(TRIM(a.rep_id::text), '') IS NOT NULL
             AND lower(TRIM(a.rep_id::text)) = ANY(effective.rep_ids)))
  ORDER BY a.order_date DESC, a.order_number, a.sku
  LIMIT  p_limit
  OFFSET p_offset
$function$;

CREATE OR REPLACE FUNCTION public.get_manager_reporting_monthly(p_manager_id uuid DEFAULT NULL::uuid, p_rep_ac_ids text[] DEFAULT NULL::text[], p_years integer[] DEFAULT NULL::integer[])
RETURNS TABLE(metric_type text, year integer, month_number integer, total_amount numeric, row_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH effective AS (
    SELECT CASE
      WHEN public.is_admin() OR public.current_manager_id() IS NOT NULL THEN p_rep_ac_ids
      WHEN public.current_rep_acctivate_ids() IS NOT NULL THEN public.current_rep_acctivate_ids()
      ELSE ARRAY['__no_rep_mapped__']
    END AS rep_ids
  )
  SELECT
    a.metric_type,
    a.year,
    a.month_number,
    COALESCE(SUM(a.amount), 0) AS total_amount,
    COUNT(*)                   AS row_count
  FROM public.v_companywide_reporting_actuals a, effective
  WHERE
    (p_years IS NULL OR a.year = ANY(p_years))
    AND (
      (effective.rep_ids IS NOT NULL
        AND NULLIF(TRIM(a.rep_id), '') IS NOT NULL
        AND LOWER(TRIM(a.rep_id)) = ANY(
          SELECT LOWER(TRIM(x)) FROM unnest(effective.rep_ids) AS x
          WHERE NULLIF(TRIM(x), '') IS NOT NULL
        ))
      OR
      (effective.rep_ids IS NULL
        AND (p_manager_id IS NULL OR a.manager_id = p_manager_id))
    )
  GROUP BY 1, 2, 3
  ORDER BY 1, 2, 3;
$function$;

CREATE OR REPLACE FUNCTION public.get_portal_dealer_rep_reporting_lines(
  p_metric text,
  p_from date DEFAULT NULL::date,
  p_to date DEFAULT NULL::date,
  p_discount_code text DEFAULT NULL::text,
  p_limit integer DEFAULT 1000,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  metric_type text, transaction_date date, year integer, month_number integer,
  dealer_name text, customer_id text, rep_name text, rep_id text,
  sku text, description text, brand_category text, product_class text,
  amount numeric, invoice_number text, fulfillment_type text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH effective AS (
    SELECT CASE
      WHEN public.is_admin() OR public.current_manager_id() IS NOT NULL THEN NULL::text[]
      WHEN public.current_rep_acctivate_ids() IS NOT NULL THEN public.current_rep_acctivate_ids()
      ELSE ARRAY['__no_rep_mapped__']
    END AS rep_ids
  )
  SELECT
    a.metric_type, a.transaction_date, a.year, a.month_number,
    a.dealer_name, a.customer_id, a.rep_name, a.rep_id,
    a.sku, a.description, a.brand_category, a.product_class,
    a.amount, a.invoice_number, a.fulfillment_type
  FROM public.v_portal_dealer_rep_reporting_lines a, effective
  WHERE a.metric_type = p_metric
    AND (p_from IS NULL OR a.transaction_date >= p_from)
    AND (p_to   IS NULL OR a.transaction_date <  p_to)
    AND (p_discount_code IS NULL OR a.discount_code = p_discount_code)
    AND (effective.rep_ids IS NULL
         OR (NULLIF(TRIM(a.rep_id), '') IS NOT NULL AND lower(TRIM(a.rep_id)) = ANY(effective.rep_ids)))
  ORDER BY a.transaction_date
  LIMIT p_limit OFFSET p_offset
$function$;

-- ── 5. Upgrade market_appointments' 4 rep policies to multi-rep ────────────
DROP POLICY IF EXISTS "Reps read own market appointments" ON public.market_appointments;
CREATE POLICY "Reps read own market appointments" ON public.market_appointments
  FOR SELECT USING (rep_id IN (SELECT public.current_rep_ids()));

DROP POLICY IF EXISTS "Reps update own market appointments" ON public.market_appointments;
CREATE POLICY "Reps update own market appointments" ON public.market_appointments
  FOR UPDATE
  USING (rep_id IN (SELECT public.current_rep_ids()))
  WITH CHECK (rep_id IN (SELECT public.current_rep_ids()));

DROP POLICY IF EXISTS "Reps delete own market appointments" ON public.market_appointments;
CREATE POLICY "Reps delete own market appointments" ON public.market_appointments
  FOR DELETE USING (rep_id IN (SELECT public.current_rep_ids()));

DROP POLICY IF EXISTS "Reps insert own market appointments" ON public.market_appointments;
CREATE POLICY "Reps insert own market appointments" ON public.market_appointments
  FOR INSERT WITH CHECK (rep_id IN (SELECT public.current_rep_ids()));

-- ── 6. Upgrade dealers' rep-read policy — SalesReporting.tsx's dealer list/
--       filter depends on this directly ────────────────────────────────────
DROP POLICY IF EXISTS "Reps read own dealers" ON public.dealers;
CREATE POLICY "Reps read own dealers" ON public.dealers
  FOR SELECT USING (rep_id IN (SELECT public.current_rep_ids()));

-- ── 7. Upgrade labor_day_2026_participants' rep-read policy ────────────────
DROP POLICY IF EXISTS "Staff or own rep read ld26 participants" ON public.labor_day_2026_participants;
CREATE POLICY "Staff or own rep read ld26 participants" ON public.labor_day_2026_participants
  FOR SELECT USING (
    public.is_admin() OR public.current_manager_id() IS NOT NULL
    OR (public.current_rep_acctivate_ids() IS NOT NULL
        AND lower(trim(salesperson_id)) = ANY(public.current_rep_acctivate_ids()))
  );

-- ── 8. Map Jordan Shindell to his second territory ─────────────────────────
-- Existing mapping (jordanshindell@gmail.com -> "Shindell - PA/OH" / Shin2)
-- is untouched; this adds "Shindell- Beach" / Shin alongside it.
INSERT INTO public.user_reps (user_id, rep_id)
VALUES ('d34fe893-5b31-4af7-9160-e991cbed0459', '96ec9def-176e-4d5e-9a0a-2823d59bd9f4')
ON CONFLICT (user_id, rep_id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- select current_rep_acctivate_ids() as ids -- as Jordan: expect {shin,shin2}
--
-- select round(sum(primary_amt),2) from get_sales_reporting_grouped_rows(
--   'invoiced','dealer','2020-01-01','2030-12-31',NULL,NULL,NULL,NULL,NULL,NULL)
-- -- as Jordan: must now include both Shin and Shin2 dealers/amounts, where
-- -- before it only included Shin2.
--
-- select count(*) from dealers where rep_id in (
--   '96ec9def-176e-4d5e-9a0a-2823d59bd9f4','9d218273-c52d-4103-8695-29b756d3f120')
-- -- as Jordan (via RLS): must equal this count now, where before it only
-- -- returned the Shin2 subset.
-- ══════════════════════════════════════════════════════════════════════════════
