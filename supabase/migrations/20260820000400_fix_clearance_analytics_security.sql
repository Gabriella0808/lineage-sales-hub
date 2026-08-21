-- Fix v_portal_clearance_sales_analytics returning 0 rows via PostgREST.
--
-- Root cause: migration 20260820000300 created the view with
-- security_invoker = true, which causes it to execute as the calling
-- authenticated user. That user has no RLS policy on
-- acctivate_invoice_lines_2026_direct (accessed through the chained
-- security_invoker v_portal_invoice_line_facts), so the query returns
-- 0 rows silently — no error, just empty.
--
-- The Supabase SQL editor returned rows because it runs as postgres
-- (superuser), which bypasses RLS entirely.
--
-- Fix: remove security_invoker so the view runs as its owner (postgres),
-- matching v_companywide_reporting_actuals and v_portal_dealer_rep_reporting_lines.
-- Join the base table directly to avoid the security_invoker chain in
-- v_portal_invoice_line_facts.

DROP VIEW IF EXISTS public.v_portal_clearance_sales_analytics CASCADE;

CREATE VIEW public.v_portal_clearance_sales_analytics AS
SELECT
  d.invoice_date                                                    AS sale_date,
  -- Saturday–Friday week (DOW: 0=Sun … 5=Fri, 6=Sat)
  -- days_to_friday = (5 - DOW + 7) % 7  →  Sat gets 6, Fri gets 0
  (d.invoice_date
    + (((5 - EXTRACT(DOW FROM d.invoice_date)::int + 7) % 7))::int
    - 6
  )                                                                 AS week_start,
  (d.invoice_date
    + (((5 - EXTRACT(DOW FROM d.invoice_date)::int + 7) % 7))::int
  )                                                                 AS week_end,
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
  COALESCE(d.qty_invoiced,      0)::numeric                        AS quantity_sold,
  COALESCE(d.formula_net_amount, 0)::numeric                       AS sales_amount,
  d.invoice_number,
  disc.synced_at
FROM public.acctivate_invoice_lines_2026_direct d
INNER JOIN (
  -- One row per product_id; avoids fan-out from multi-warehouse rows
  SELECT
    product_id,
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
  AND d.product_sales_category IN ('SW', 'FINNLOU', 'LUX', 'ALLOW');

GRANT SELECT ON public.v_portal_clearance_sales_analytics
  TO authenticated, anon, service_role;

-- Notify PostgREST to reload schema cache
SELECT pg_notify('pgrst', 'reload schema');
