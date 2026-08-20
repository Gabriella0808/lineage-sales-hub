-- Replace the view-based approach with a SECURITY DEFINER function.
--
-- SET ROLE authenticated on v_portal_clearance_sales_analytics returns 0 rows
-- because PostgreSQL evaluates RLS on the underlying tables for the calling
-- user regardless of the view's security_invoker setting, and
-- acctivate_invoice_lines_2026_direct has no permissive policy for
-- authenticated.
--
-- SECURITY DEFINER functions run as their owner (postgres = superuser),
-- which bypasses RLS entirely. This is the same pattern used by
-- get_portal_invoiced_lines(), get_sales_reporting_grouped_rows(), etc.
--
-- Frontend: change .from("v_portal_clearance_sales_analytics") to
--           .rpc("get_clearance_analytics", { p_from, p_to })

DROP FUNCTION IF EXISTS public.get_clearance_analytics(date, date);

CREATE FUNCTION public.get_clearance_analytics(
  p_from date DEFAULT NULL,
  p_to   date DEFAULT NULL
)
RETURNS TABLE (
  sale_date      date,
  week_start     date,
  week_end       date,
  rep_name       text,
  rep_id         text,
  sku            text,
  product        text,
  product_class  text,
  quantity_sold  numeric,
  sales_amount   numeric,
  invoice_number text,
  synced_at      timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.invoice_date::date                                              AS sale_date,
    (d.invoice_date
      + (((5 - EXTRACT(DOW FROM d.invoice_date)::int + 7) % 7))::int
      - 6
    )::date                                                           AS week_start,
    (d.invoice_date
      + (((5 - EXTRACT(DOW FROM d.invoice_date)::int + 7) % 7))::int
    )::date                                                           AS week_end,
    COALESCE(
      NULLIF(TRIM(asr.name::text),           ''),
      NULLIF(TRIM(pai.sales_rep_name::text), ''),
      NULLIF(TRIM(pai.sales_rep_id::text),   ''),
      NULLIF(TRIM(d.sales_rep_id),           ''),
      'Unassigned'
    )                                                                 AS rep_name,
    COALESCE(NULLIF(TRIM(d.sales_rep_id), ''), '')                   AS rep_id,
    d.product_id                                                      AS sku,
    d.description                                                     AS product,
    COALESCE(disc.product_class, d.product_sales_category)           AS product_class,
    COALESCE(d.qty_invoiced,       0)::numeric                       AS quantity_sold,
    COALESCE(d.formula_net_amount, 0)::numeric                       AS sales_amount,
    d.invoice_number,
    disc.synced_at
  FROM public.acctivate_invoice_lines_2026_direct d
  INNER JOIN (
    SELECT product_id,
           MAX(product_class) AS product_class,
           MAX(synced_at)     AS synced_at
    FROM public.stg_acctivate_discontinued_inventory
    GROUP BY product_id
  ) disc ON disc.product_id = d.product_id
  LEFT JOIN public.portal_acctivate_invoices pai
    ON pai.guid_invoice::text = d.guid_invoice
  LEFT JOIN public.acctivate_sales_reps asr
    ON LOWER(TRIM(asr.acctivate_id)) = LOWER(TRIM(d.sales_rep_id))
  WHERE d.invoice_date IS NOT NULL
    AND d.invoice_date >= '2026-01-01'
    AND d.product_sales_category IN ('SW', 'FINNLOU', 'LUX', 'ALLOW')
    AND (p_from IS NULL OR d.invoice_date >= p_from)
    AND (p_to   IS NULL OR d.invoice_date <  p_to)
$$;

GRANT EXECUTE ON FUNCTION public.get_clearance_analytics(date, date)
  TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
