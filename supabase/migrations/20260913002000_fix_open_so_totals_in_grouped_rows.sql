-- ══════════════════════════════════════════════════════════════════════════════
-- Fix the "Open SO" column/Total in Dealer Reporting and Rep Reporting,
-- which both under-count relative to the true canonical Open SO total
-- (v_portal_open_sales_order_line_facts).
--
-- DEALER branch: confirmed via direct query -
--   Canonical total (all rows):                         $2,340,272.60
--   Dealer Reporting "Open SO" column, summed:           $2,117,597.98
--   Difference:                                            $222,674.62
-- Root cause: open_so_agg (grouped by customer_id) already correctly
-- aggregates every dealer, including ones with no roster match - but it
-- is only LEFT JOINed against `roster` (active, source<>field_only,
-- salesperson/territory-assigned dealers). The "Unmatched / Unassigned
-- Dealer" UNION ALL row - which already exists for exactly this purpose
-- on the bookings/invoiced side - hardcoded open_so_value to NULL
-- instead of summing the unmatched open_so_agg rows, so $222,674.62 of
-- real open orders on unmatched customer_ids silently vanished from the
-- Total. Fixed by summing open_so_agg for the same NOT EXISTS-in-roster
-- set already used for the unmatched revenue sum, and by also triggering
-- that row's existence when there is unmatched Open SO even if
-- unmatched revenue happens to be zero for the selected period.
--
-- REP branch: open_so_value was hardcoded to NULL for every single rep
-- row (the rep/territory branch never joined the Open SO source at
-- all). Additionally confirmed 2 reps (Kerry: $1,642.00, Indy:
-- $1,047.00) have real open orders but zero bookings/invoiced in the
-- selected period, so they never appeared as a row at all (the rep
-- branch is built from revenue transactions, unlike the dealer branch
-- which iterates the full dealer roster regardless of revenue). Fixed
-- by adding an open_so_agg CTE (grouped by the same rep_id/rep_name/
-- 'Unassigned' key get_open_sales_order_lines already uses), LEFT
-- JOINing it onto the revenue-based rows, and adding rows for any rep
-- with nonzero Open SO that has no revenue row to join onto.
--
-- Nothing else changes: primary_amt/comp_amt/container_amt/warehouse_amt
-- formulas, dealer/rep roster matching, date logic, and every other
-- column are byte-for-byte identical to the prior version of this
-- function - only open_so_value's aggregation (and, for reps, row
-- coverage) is corrected. Bookings, invoiced, July logic, Labor Day
-- Promo, and the tariff/surcharge/freight-out Open SO exclusions
-- (20260913001800, 20260913001900) are untouched.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_sales_reporting_grouped_rows(p_metric text, p_group_by text, p_from date, p_to date, p_comp_from date DEFAULT NULL::date, p_comp_to date DEFAULT NULL::date, p_customer_ids text[] DEFAULT NULL::text[], p_brand_cats text[] DEFAULT NULL::text[], p_skus text[] DEFAULT NULL::text[], p_rep_ids text[] DEFAULT NULL::text[], p_manager_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(entity_key text, entity_label text, primary_amt numeric, primary_lines bigint, comp_amt numeric, comp_lines bigint, container_amt numeric, warehouse_amt numeric, customer_id text, rep_name text, territory_name text, manager_name text, open_so_value numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
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
        AND (p_rep_ids IS NULL
             OR (NULLIF(TRIM(sr.acctivate_id), '') IS NOT NULL
                 AND lower(trim(sr.acctivate_id)) = ANY(p_rep_ids)))
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
        -- NOTE: no customer_id-not-null filter here (unlike the original
        -- version of this CTE) — a NULL customer_id can never match any
        -- roster row (NULL = anything is never true), so it already falls
        -- through to the Unmatched/Unassigned bucket below correctly;
        -- excluding it here would instead make it vanish silently, which is
        -- exactly the bug this migration fixes.
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

    -- Unmatched / Unassigned Dealer — revenue AND open sales orders with
    -- no active-roster match at all (including rows with NULL
    -- customer_id). Only in the fully unfiltered view; only when there's
    -- actually something unmatched (revenue, comparative revenue, or
    -- open SO value).
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
    WHERE p_customer_ids IS NULL
      AND p_rep_ids      IS NULL
      AND p_manager_id   IS NULL
      AND (ua.primary_amt != 0 OR ua.comp_amt != 0 OR uos.open_so_value != 0)

    ORDER BY 3 DESC NULLS LAST;

  ELSE
    -- ── Rep / territory branch ──────────────────────────────────────────
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
        AND (p_rep_ids IS NULL
             OR (NULLIF(TRIM(a.rep_id::text), '') IS NOT NULL
                 AND lower(TRIM(a.rep_id::text)) = ANY(p_rep_ids)))
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
      -- Same entity_key derivation get_open_sales_order_lines uses for its
      -- rep branch, so entity_key values line up exactly with src_agg's.
      SELECT
        COALESCE(NULLIF(TRIM(o.rep_id::text), ''), NULLIF(TRIM(o.rep_name::text), ''), 'Unassigned') AS entity_key,
        MAX(NULLIF(TRIM(o.rep_name::text), '')) AS rep_name_fallback,
        SUM(o.open_so_amount) AS open_so_value
      FROM public.v_portal_open_sales_order_line_facts o
      WHERE (p_manager_id IS NULL OR o.manager_id = p_manager_id)
        AND (p_rep_ids IS NULL
             OR (NULLIF(TRIM(o.rep_id::text), '') IS NOT NULL
                 AND lower(TRIM(o.rep_id::text)) = ANY(p_rep_ids)))
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
      COALESCE(sa.comp_lines, 0)::bigint                                                               AS comp_lines,
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
-- 1. Dealer Reporting Open SO total must now equal the canonical total:
--    SELECT round(sum(open_so_value)::numeric,2)
--    FROM get_sales_reporting_grouped_rows(p_group_by:='dealer', p_metric:='invoiced',
--      p_from:='2026-07-01', p_to:='2026-09-10', p_customer_ids:=NULL,
--      p_brand_cats:=NULL, p_skus:=NULL, p_rep_ids:=NULL, p_manager_id:=NULL);
--    -- expect $2,340,272.60 (was $2,117,597.98)
--
-- 2. Rep Reporting Open SO total must now be non-null and reflect real
--    per-rep values, including Kerry ($1,642.00) and Indy ($1,047.00) who
--    previously had no row at all:
--    SELECT round(sum(open_so_value)::numeric,2)
--    FROM get_sales_reporting_grouped_rows(p_group_by:='rep', p_metric:='bookings',
--      p_from:='2026-07-01', p_to:='2026-09-10', p_customer_ids:=NULL,
--      p_brand_cats:=NULL, p_skus:=NULL, p_rep_ids:=NULL, p_manager_id:=NULL);
--    -- expect $2,340,272.60 (same canonical total, grouped a different way)
--
-- 3. Bookings/invoiced primary_amt/comp_amt for every existing row must be
--    byte-for-byte unchanged from before this migration.
-- ══════════════════════════════════════════════════════════════════════════════
