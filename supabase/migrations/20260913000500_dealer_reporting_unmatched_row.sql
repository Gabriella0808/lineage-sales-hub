-- ══════════════════════════════════════════════════════════════════════════════
-- Reconcile Dealer Reporting to Live KPI by adding a visible "Unmatched /
-- Unassigned Dealer" row, instead of silently dropping revenue that doesn't
-- match an active dealer.
--
-- ROOT CAUSE (confirmed empirically before writing this):
--   Live KPI bookings (Aug 2026+)   : $1,295,139.27
--   Rep Reporting bookings          : $1,295,139.27  -- already reconciles;
--                                                        rep branch always
--                                                        resolves to a rep_id
--                                                        or the literal
--                                                        'Unassigned' bucket,
--                                                        so it never drops
--                                                        revenue. NOT changed
--                                                        by this migration.
--   Dealer Reporting bookings       : $1,161,204.92  -- SHORT by $133,934.35
--
--   Live KPI invoiced (Jul 2026+)   : $2,334,884.69
--   Rep Reporting invoiced          : $2,334,884.69  -- already reconciles
--   Dealer Reporting invoiced       : $2,334,884.69  -- already reconciles
--                                                        (closed by the
--                                                        20260913000200
--                                                        backfill)
--
-- The dealer branch's FROM clause starts at `roster` (the active-dealer
-- table) and LEFT JOINs sales onto it — so any sales_agg row whose cust_key
-- never appears in roster is simply never selected, not summed as $0, just
-- absent. That's fine for individually-identifiable dealers missing from
-- the roster (fixable by adding them, as done for invoiced), but bookings
-- still has revenue that can NEVER be roster-matched at all — e.g. 428
-- lines with a literal NULL customer_id. No amount of roster backfill can
-- fix that. This migration fixes the general case instead of chasing
-- individual customer_ids: a UNION ALL branch aggregates everything in
-- sales_agg that doesn't match any active dealer into one visible row.
--
-- Only appears in the fully unfiltered view (p_customer_ids, p_rep_ids,
-- p_manager_id all NULL) — under any dealer/rep/territory/manager filter it
-- can't be meaningfully attributed, so it's correctly absent there, same as
-- it would be if you filtered to a specific dealer today. Only appears at
-- all when there IS unmatched revenue for the requested metric/date range
-- (HAVING ... != 0) — for invoiced right now that's nothing, so this row
-- won't show there; for bookings it will, at $133,934.35.
--
-- Everything else is untouched: roster/sales_agg/open_so_agg CTEs, the
-- formula, the rep/territory branch (verbatim, unchanged), Open SO, Labor
-- Day Promo, the Jan-Jun invoiced cutoff, the Aug-1 bookings cutoff. This
-- migration only adds rows that were previously invisible; it does not
-- change any existing row's numbers.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_sales_reporting_grouped_rows(
  p_metric       text,
  p_group_by     text,
  p_from         date,
  p_to           date,
  p_comp_from    date    DEFAULT NULL,
  p_comp_to      date    DEFAULT NULL,
  p_customer_ids text[]  DEFAULT NULL,
  p_brand_cats   text[]  DEFAULT NULL,
  p_skus         text[]  DEFAULT NULL,
  p_rep_ids      text[]  DEFAULT NULL,
  p_manager_id   uuid    DEFAULT NULL
)
RETURNS TABLE (
  entity_key     text,
  entity_label   text,
  primary_amt    numeric,
  primary_lines  bigint,
  comp_amt       numeric,
  comp_lines     bigint,
  container_amt  numeric,
  warehouse_amt  numeric,
  customer_id    text,
  rep_name       text,
  territory_name text,
  manager_name   text,
  open_so_value  numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
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

    -- Unmatched / Unassigned Dealer — revenue with no active-roster match at
    -- all (including rows with NULL customer_id). Only in the fully
    -- unfiltered view; only when there's actually something unmatched.
    SELECT
      'UNASSIGNED_DEALER'::text                                   AS entity_key,
      'Unmatched / Unassigned Dealer'::text                       AS entity_label,
      COALESCE(SUM(sa.primary_amt), 0)::numeric                  AS primary_amt,
      COALESCE(SUM(sa.primary_lines), 0)::bigint                 AS primary_lines,
      COALESCE(SUM(sa.comp_amt), 0)::numeric                     AS comp_amt,
      COALESCE(SUM(sa.comp_lines), 0)::bigint                    AS comp_lines,
      COALESCE(SUM(sa.container_amt), 0)::numeric                AS container_amt,
      COALESCE(SUM(sa.warehouse_amt), 0)::numeric                AS warehouse_amt,
      NULL::text                                                   AS customer_id,
      NULL::text                                                   AS rep_name,
      NULL::text                                                   AS territory_name,
      NULL::text                                                   AS manager_name,
      NULL::numeric                                                AS open_so_value
    FROM sales_agg sa
    WHERE NOT EXISTS (SELECT 1 FROM roster r WHERE r.cust_key = sa.cust_key)
      AND p_customer_ids IS NULL
      AND p_rep_ids      IS NULL
      AND p_manager_id   IS NULL
    HAVING COALESCE(SUM(sa.primary_amt), 0) != 0 OR COALESCE(SUM(sa.comp_amt), 0) != 0

    ORDER BY 3 DESC NULLS LAST;

  ELSE
    -- ── Rep / territory branch — unchanged, verbatim ──────────────────────
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
    )
    SELECT
      s.entity_key,
      MAX(s.entity_label)::text                                                                      AS entity_label,
      COALESCE(SUM(s.amount) FILTER (WHERE s.transaction_date BETWEEN p_from AND p_to), 0)::numeric   AS primary_amt,
      COALESCE(COUNT(*)      FILTER (WHERE s.transaction_date BETWEEN p_from AND p_to), 0)::bigint    AS primary_lines,
      COALESCE(SUM(s.amount) FILTER (WHERE p_comp_from IS NOT NULL AND s.transaction_date BETWEEN p_comp_from AND p_comp_to), 0)::numeric AS comp_amt,
      COALESCE(COUNT(*)      FILTER (WHERE p_comp_from IS NOT NULL AND s.transaction_date BETWEEN p_comp_from AND p_comp_to), 0)::bigint  AS comp_lines,
      COALESCE(SUM(s.amount) FILTER (WHERE s.transaction_date BETWEEN p_from AND p_to AND s.fulfillment_type = 'container'), 0)::numeric   AS container_amt,
      COALESCE(SUM(s.amount) FILTER (WHERE s.transaction_date BETWEEN p_from AND p_to AND s.fulfillment_type = 'warehouse'), 0)::numeric   AS warehouse_amt,
      NULL::text    AS customer_id,
      NULL::text    AS rep_name,
      NULL::text    AS territory_name,
      NULL::text    AS manager_name,
      NULL::numeric AS open_so_value
    FROM src s
    GROUP BY s.entity_key
    HAVING
      COALESCE(SUM(s.amount) FILTER (WHERE s.transaction_date BETWEEN p_from AND p_to), 0) != 0
      OR COALESCE(SUM(s.amount) FILTER (WHERE p_comp_from IS NOT NULL AND s.transaction_date BETWEEN p_comp_from AND p_comp_to), 0) != 0
    ORDER BY 3 DESC NULLS LAST;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_reporting_grouped_rows(
  text, text, date, date, date, date, text[], text[], text[], text[], uuid
) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- A. Live KPI bookings (Aug 2026+):
--    SELECT round(sum(total_amount),2) FROM public.get_manager_reporting_monthly(NULL,NULL,ARRAY[2026])
--    WHERE metric_type='bookings' AND month_number >= 8;
--
-- B/C. Dealer + Rep Reporting bookings, no filters (must equal A):
--    SELECT round(sum(primary_amt),2) FROM public.get_sales_reporting_grouped_rows(
--      'bookings','dealer','2026-08-01',current_date,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
--    SELECT round(sum(primary_amt),2) FROM public.get_sales_reporting_grouped_rows(
--      'bookings','rep','2026-08-01',current_date,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
--
-- D. Live KPI invoiced (Jul 2026+):
--    SELECT round(sum(total_amount),2) FROM public.get_manager_reporting_monthly(NULL,NULL,ARRAY[2026])
--    WHERE metric_type='invoiced' AND month_number >= 7;
--
-- E/F. Dealer + Rep Reporting invoiced, no filters (must equal D):
--    SELECT round(sum(primary_amt),2) FROM public.get_sales_reporting_grouped_rows(
--      'invoiced','dealer','2026-01-01',current_date,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
--    SELECT round(sum(primary_amt),2) FROM public.get_sales_reporting_grouped_rows(
--      'invoiced','rep','2026-01-01',current_date,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
--
-- G. The Unmatched row itself (bookings — should show ~$133,934.35 right now):
--    SELECT entity_label, primary_amt FROM public.get_sales_reporting_grouped_rows(
--      'bookings','dealer','2026-08-01',current_date,NULL,NULL,NULL,NULL,NULL,NULL,NULL)
--    WHERE entity_key = 'UNASSIGNED_DEALER';
-- ══════════════════════════════════════════════════════════════════════════════
