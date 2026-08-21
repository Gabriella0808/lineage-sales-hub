-- Fix dealer entity_key in reporting RPCs to use customer_id as the canonical key.
--
-- Root cause:
--   get_sales_reporting_grouped_rows and get_sales_reporting_detail_lines both
--   generate the dealer entity_key as:
--     COALESCE(dealer_name, customer_id, 'Unknown')
--   This splits the same dealer into multiple rows when dealer_name differs
--   between bookings (e.g. NULL or 'HUDSONSFURN') and invoices
--   ('Hudsons Furniture Showroom'), even though customer_id = 'HUDSONSFURN'
--   on both.
--
-- Fix:
--   Reverse the priority — use customer_id first, dealer_name as fallback:
--     COALESCE(customer_id, dealer_name, 'Unknown')
--   This matches the frontend line-mode aggregation fix (customer_id as grouping key).
--
-- Both the grouped-rows RPC (total display) and the detail-lines RPC
-- (drill-down sheet) must use the same expression so entity_key values are
-- consistent between the two calls.

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
  entity_key    text,
  primary_amt   numeric,
  primary_lines bigint,
  comp_amt      numeric,
  comp_lines    bigint
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
        -- customer_id is the canonical dealer key; dealer_name is display-only
        -- and may differ between bookings and invoices for the same customer.
        THEN COALESCE(NULLIF(TRIM(a.customer_id::text), ''), NULLIF(TRIM(a.dealer_name::text), ''), 'Unknown')
        ELSE COALESCE(NULLIF(TRIM(a.rep_id::text), ''), NULLIF(TRIM(a.rep_name::text), ''), 'Unassigned')
      END         AS entity_key,
      a.amount,
      a.transaction_date
    FROM public.v_companywide_reporting_actuals a
    WHERE a.metric_type = p_metric
      AND a.transaction_date >= LEAST(p_from, COALESCE(p_comp_from, p_from))
      AND a.transaction_date <= GREATEST(p_to, COALESCE(p_comp_to, p_to))
      AND (p_manager_id IS NULL OR a.manager_id = p_manager_id)
      AND (p_customer_ids IS NULL
           OR lower(a.customer_id::text) = ANY(p_customer_ids))
      AND (p_brand_cats IS NULL
           OR array_length(p_brand_cats, 1) IS NULL
           OR COALESCE(
                a.brand_category,
                CASE WHEN p_metric = 'invoiced' THEN 'Historical Invoice' ELSE '' END
              ) = ANY(p_brand_cats))
      AND (p_skus IS NULL
           OR array_length(p_skus, 1) IS NULL
           OR a.sku = ANY(p_skus))
      AND (p_rep_ids IS NULL
           OR (
             NULLIF(TRIM(a.rep_id::text), '') IS NOT NULL
             AND lower(TRIM(a.rep_id::text)) = ANY(p_rep_ids)
           ))
  )
  SELECT
    entity_key,
    COALESCE(SUM(amount) FILTER (
      WHERE transaction_date BETWEEN p_from AND p_to
    ), 0)::numeric  AS primary_amt,
    COALESCE(COUNT(*) FILTER (
      WHERE transaction_date BETWEEN p_from AND p_to
    ), 0)::bigint   AS primary_lines,
    COALESCE(SUM(amount) FILTER (
      WHERE p_comp_from IS NOT NULL
        AND transaction_date BETWEEN p_comp_from AND p_comp_to
    ), 0)::numeric  AS comp_amt,
    COALESCE(COUNT(*) FILTER (
      WHERE p_comp_from IS NOT NULL
        AND transaction_date BETWEEN p_comp_from AND p_comp_to
    ), 0)::bigint   AS comp_lines
  FROM src
  GROUP BY entity_key
  HAVING
    COALESCE(SUM(amount) FILTER (
      WHERE transaction_date BETWEEN p_from AND p_to
    ), 0) != 0
    OR COALESCE(SUM(amount) FILTER (
      WHERE p_comp_from IS NOT NULL
        AND transaction_date BETWEEN p_comp_from AND p_comp_to
    ), 0) != 0
  ORDER BY 2 DESC NULLS LAST
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_reporting_grouped_rows(
  text, text, date, date, date, date, text[], text[], text[], text[], uuid
) TO authenticated, anon, service_role;


-- Fix get_sales_reporting_detail_lines entity_key filter for dealer mode.
-- Must be consistent with the grouped-rows function above so clicking a row
-- in total mode fetches the correct detail lines.

CREATE OR REPLACE FUNCTION public.get_sales_reporting_detail_lines(
  p_metric       text,
  p_group_by     text,
  p_entity_key   text,
  p_from         date,
  p_to           date,
  p_customer_ids text[]  DEFAULT NULL,
  p_brand_cats   text[]  DEFAULT NULL,
  p_skus         text[]  DEFAULT NULL,
  p_rep_ids      text[]  DEFAULT NULL,
  p_limit        int     DEFAULT 200,
  p_offset       int     DEFAULT 0,
  p_manager_id   uuid    DEFAULT NULL
)
RETURNS TABLE (
  transaction_date date,
  invoice_number   text,
  dealer_name      text,
  rep_name         text,
  rep_id           text,
  customer_id      text,
  sku              text,
  description      text,
  brand_category   text,
  amount           numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
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
    a.amount::numeric
  FROM public.v_companywide_reporting_actuals a
  WHERE a.metric_type = p_metric
    AND a.transaction_date BETWEEN p_from AND p_to
    AND (
      (p_group_by = 'dealer'
       -- Match on customer_id first (canonical), dealer_name as fallback.
       AND COALESCE(NULLIF(TRIM(a.customer_id::text), ''), NULLIF(TRIM(a.dealer_name::text), ''), 'Unknown') = p_entity_key)
      OR
      (p_group_by = 'rep'
       AND COALESCE(NULLIF(TRIM(a.rep_id::text), ''), NULLIF(TRIM(a.rep_name::text), ''), 'Unassigned') = p_entity_key)
    )
    AND (p_manager_id IS NULL OR a.manager_id = p_manager_id)
    AND (p_customer_ids IS NULL
         OR lower(a.customer_id::text) = ANY(p_customer_ids))
    AND (p_brand_cats IS NULL
         OR array_length(p_brand_cats, 1) IS NULL
         OR COALESCE(
              a.brand_category,
              CASE WHEN p_metric = 'invoiced' THEN 'Historical Invoice' ELSE '' END
            ) = ANY(p_brand_cats))
    AND (p_skus IS NULL
         OR array_length(p_skus, 1) IS NULL
         OR a.sku = ANY(p_skus))
    AND (p_rep_ids IS NULL
         OR (
           NULLIF(TRIM(a.rep_id::text), '') IS NOT NULL
           AND lower(TRIM(a.rep_id::text)) = ANY(p_rep_ids)
         ))
  ORDER BY a.transaction_date DESC, a.invoice_number NULLS LAST
  LIMIT  p_limit
  OFFSET p_offset
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_reporting_detail_lines(
  text, text, text, date, date, text[], text[], text[], text[], int, int, uuid
) TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
