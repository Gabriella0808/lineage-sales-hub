-- Fix: entity_label for rep groupBy in get_sales_reporting_grouped_rows()
--
-- When a booking's rep_id falls back to guid_salesperson (a UUID), the
-- previous entity_label was also that UUID, causing the drawer title and
-- table row to display a raw GUID instead of the rep's name.
--
-- Fix: entity_label now uses canonical_rep_name → rep_name → rep_id so
-- rows always display a human-readable name regardless of which rep_id
-- form ended up in the data.
--
-- entity_key is unchanged (still rep_id / rep_name) so filtering and
-- click-through still work. Only the display label is corrected.

DROP FUNCTION IF EXISTS public.get_sales_reporting_grouped_rows(text,text,date,date,date,date,text[],text[],text[],text[],uuid) CASCADE;

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
  entity_key    text,
  entity_label  text,
  primary_amt   numeric,
  primary_lines bigint,
  comp_amt      numeric,
  comp_lines    bigint,
  container_amt numeric,
  warehouse_amt numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH src AS (
    SELECT
      CASE
        WHEN p_group_by = 'dealer'
        THEN COALESCE(NULLIF(TRIM(a.customer_id::text), ''), 'Unknown')
        ELSE COALESCE(NULLIF(TRIM(a.rep_id::text), ''), NULLIF(TRIM(a.rep_name::text), ''), 'Unassigned')
      END AS entity_key,
      CASE
        WHEN p_group_by = 'dealer'
        THEN COALESCE(NULLIF(TRIM(a.dealer_name::text), ''), a.customer_id::text, 'Unknown')
        -- For reps: prefer canonical name, then raw rep_name, then rep_id as last resort
        ELSE COALESCE(
          NULLIF(TRIM(a.canonical_rep_name::text), ''),
          NULLIF(TRIM(a.rep_name::text),           ''),
          NULLIF(TRIM(a.rep_id::text),             ''),
          'Unassigned'
        )
      END AS entity_label,
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
    entity_key,
    MAX(entity_label)::text                                                                      AS entity_label,
    COALESCE(SUM(amount) FILTER (WHERE transaction_date BETWEEN p_from AND p_to), 0)::numeric   AS primary_amt,
    COALESCE(COUNT(*)    FILTER (WHERE transaction_date BETWEEN p_from AND p_to), 0)::bigint    AS primary_lines,
    COALESCE(SUM(amount) FILTER (WHERE p_comp_from IS NOT NULL AND transaction_date BETWEEN p_comp_from AND p_comp_to), 0)::numeric AS comp_amt,
    COALESCE(COUNT(*)    FILTER (WHERE p_comp_from IS NOT NULL AND transaction_date BETWEEN p_comp_from AND p_comp_to), 0)::bigint  AS comp_lines,
    COALESCE(SUM(amount) FILTER (WHERE transaction_date BETWEEN p_from AND p_to AND fulfillment_type = 'container'), 0)::numeric   AS container_amt,
    COALESCE(SUM(amount) FILTER (WHERE transaction_date BETWEEN p_from AND p_to AND fulfillment_type = 'warehouse'), 0)::numeric   AS warehouse_amt
  FROM src
  GROUP BY entity_key
  HAVING
    COALESCE(SUM(amount) FILTER (WHERE transaction_date BETWEEN p_from AND p_to), 0) != 0
    OR COALESCE(SUM(amount) FILTER (WHERE p_comp_from IS NOT NULL AND transaction_date BETWEEN p_comp_from AND p_comp_to), 0) != 0
  ORDER BY 3 DESC NULLS LAST
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_reporting_grouped_rows(
  text, text, date, date, date, date, text[], text[], text[], text[], uuid
) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
