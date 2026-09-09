-- ══════════════════════════════════════════════════════════════════════════════
-- Dealer Reporting: rebuild from sales-driven to dealer-roster-driven.
--
-- PROBLEM: get_sales_reporting_grouped_rows(p_group_by='dealer') was driven
-- entirely by v_companywide_reporting_actuals — a dealer only appeared if it
-- had at least one invoice/booking line in the selected + comparative range
-- (enforced by a HAVING sum != 0 clause). Dealers with zero sales in the
-- period never showed at all, and a rep filter matched the REP STAMPED ON
-- THE TRANSACTION LINE, not the dealer's actual roster-assigned rep — so a
-- $0 dealer could never appear even when explicitly filtering to their rep.
--
-- FIX (dealer branch only): base the row set on public.dealers (the same
-- active-dealer source the portal's dealer directory/network pages already
-- use — confirmed via useDealers()/DealersPage.tsx/DirectoryPage.tsx: every
-- one of them treats a dealer as active when
--   source <> 'field_only' AND (salesperson <> '' OR territory <> '')
-- dealers.status is NOT part of that predicate — confirmed empirically:
-- among source='acctivate' dealers, the 628 with salesperson/territory
-- populated and the 400 with status='active' are DISJOINT sets (zero
-- overlap), so intersecting with status would have produced an empty
-- roster. Matching the directory page's real, working predicate exactly.
--
-- Sales (v_companywide_reporting_actuals) are now LEFT JOINed onto that
-- roster instead of being the base — every active dealer gets a row, $0 or
-- not. rep/territory/manager filters now scope by the DEALER'S ASSIGNED
-- identity (dealers.rep_id/territory_id/manager_id), not the transaction
-- line's rep — required so "filter by rep" shows that rep's $0 dealers too.
-- Brand/SKU filters still narrow which sales count toward primary/comp
-- amounts, without removing the dealer row itself.
--
-- New columns: customer_id, rep_name, territory_name, manager_name,
-- open_so_value (from v_portal_open_sales_order_line_facts, unfiltered by
-- date/brand — same "current state, not historical" treatment Open SO gets
-- everywhere else in the app). No MTD %/YTD % — dealers don't have
-- individual monthly/annual targets in this system (only reps do, via
-- rep_targets), so there's nothing meaningful to compute that against;
-- omitted rather than fabricated. % Unclassified is derivable client-side
-- from container_amt/warehouse_amt vs primary_amt, same as %Cont/%Whse
-- already are — not added as a separate column since it wasn't already
-- present anywhere in this report.
--
-- REP / TERRITORY BRANCH: byte-for-byte unchanged — see the ELSE branch
-- below, which is the original function body verbatim. Nothing about
-- booking/invoice calculation logic, Live KPI, Labor Day Promo, Open SO
-- formula, or sync scripts is touched by this migration.
--
-- KNOWN GAP (flagging, not silently fixing): matching the directory page's
-- exact predicate excludes ~$600K of real 90-day revenue (see validation
-- query 5 below) from dealers whose `dealers` row is malformed (a
-- portal-generated UUID sitting in acctivate_id instead of the real
-- Acctivate CustId) or whose linked row exists but has salesperson/
-- territory blank. This is a data-quality issue in `public.dealers`
-- itself, not something this migration should try to paper over — it's
-- the same predicate the dealer directory already uses today.
-- ══════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_sales_reporting_grouped_rows(text,text,date,date,date,date,text[],text[],text[],text[],uuid);

CREATE FUNCTION public.get_sales_reporting_grouped_rows(
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
        AND NULLIF(TRIM(a.customer_id::text), '') IS NOT NULL
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
    ORDER BY 3 DESC NULLS LAST;

  ELSE
    -- ── Rep / territory branch — unchanged from 20260902000600, verbatim ──────
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

-- ── Case-insensitive dealer entity-key match for the Open SO drill-down ─────
-- Needed so a $0-sales dealer's entity_key (now sourced from dealers.acctivate_id,
-- which may differ in case from portal_acctivate_orders.customer_id) can still
-- find that dealer's open orders. Formula/filters/totals unchanged — this only
-- makes the dealer-key comparison robust to case, same treatment p_customer_ids
-- and p_rep_ids already get elsewhere in this same function.
CREATE OR REPLACE FUNCTION public.get_open_sales_order_lines(
  p_group_by     text,
  p_entity_key   text,
  p_customer_ids text[]  DEFAULT NULL,
  p_brand_cats   text[]  DEFAULT NULL,
  p_skus         text[]  DEFAULT NULL,
  p_rep_ids      text[]  DEFAULT NULL,
  p_manager_id   uuid    DEFAULT NULL,
  p_limit        int     DEFAULT 2000,
  p_offset       int     DEFAULT 0
)
RETURNS TABLE (
  guid_order          text,
  order_number        text,
  order_date          date,
  requested_ship_date date,
  customer_id         text,
  dealer_name         text,
  rep_id              text,
  rep_name             text,
  fulfillment_type     text,
  warehouse             text,
  sku                   text,
  description           text,
  product_class         text,
  brand_category        text,
  qty_ordered           numeric,
  qty_shipped           numeric,
  qty_open              numeric,
  unit_price            numeric,
  line_discount_pct     numeric,
  net_open_amount       numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    a.guid_order, a.order_number, a.order_date, a.requested_ship_date,
    a.customer_id, a.dealer_name, a.rep_id, a.rep_name,
    a.fulfillment_type, a.warehouse, a.sku, a.description, a.product_class,
    a.brand_category, a.qty_ordered, a.qty_shipped, a.qty_open,
    a.unit_price, a.line_discount_pct, a.open_so_amount
  FROM public.v_portal_open_sales_order_line_facts a
  WHERE
    (
      (p_group_by = 'dealer'
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
    AND (p_rep_ids IS NULL
         OR (NULLIF(TRIM(a.rep_id::text), '') IS NOT NULL
             AND lower(TRIM(a.rep_id::text)) = ANY(p_rep_ids)))
  ORDER BY a.order_date DESC, a.order_number, a.sku
  LIMIT  p_limit
  OFFSET p_offset
$$;

GRANT EXECUTE ON FUNCTION public.get_open_sales_order_lines(
  text, text, text[], text[], text[], text[], uuid, int, int
) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- 1. Active dealers in the roster (same predicate the dealer directory uses):
--    SELECT count(*) FROM public.dealers
--    WHERE source <> 'field_only'
--      AND (NULLIF(TRIM(salesperson),'') IS NOT NULL OR NULLIF(TRIM(territory),'') IS NOT NULL);
--
-- 2. Dealer rows returned with no filters (should match #1):
--    SELECT count(*) FROM public.get_sales_reporting_grouped_rows(
--      'bookings', 'dealer', '2026-01-01', '2026-12-31', NULL, NULL, NULL, NULL, NULL, NULL, NULL
--    );
--
-- 3. Dealers with zero sales in a period:
--    SELECT count(*) FROM public.get_sales_reporting_grouped_rows(
--      'bookings', 'dealer', '2026-08-01', '2026-08-31', NULL, NULL, NULL, NULL, NULL, NULL, NULL
--    ) WHERE primary_amt = 0;
--
-- 4. Spot check a specific $0 dealer:
--    SELECT * FROM public.get_sales_reporting_grouped_rows(
--      'bookings', 'dealer', '2026-08-01', '2026-08-31', NULL, NULL, NULL, NULL, NULL, NULL, NULL
--    ) WHERE entity_label ILIKE '%<dealer name>%';
--
-- 5. KNOWN GAP — revenue from customer_ids not matched to the active roster
--    (data-quality issue in public.dealers, not this migration):
--    SELECT a.metric_type, count(DISTINCT a.customer_id) AS unmatched_customers, round(sum(a.amount),2) AS unmatched_amount
--    FROM public.v_companywide_reporting_actuals a
--    WHERE a.transaction_date >= current_date - interval '90 days'
--      AND NOT EXISTS (
--        SELECT 1 FROM public.dealers d
--        WHERE d.source <> 'field_only'
--          AND (NULLIF(TRIM(d.salesperson), '') IS NOT NULL OR NULLIF(TRIM(d.territory), '') IS NOT NULL)
--          AND lower(trim(d.acctivate_id)) = lower(trim(a.customer_id::text))
--      )
--    GROUP BY a.metric_type;
-- ══════════════════════════════════════════════════════════════════════════════
