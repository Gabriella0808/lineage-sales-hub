DROP MATERIALIZED VIEW IF EXISTS public.dealer_monthly_invoice_totals;

CREATE MATERIALIZED VIEW public.dealer_monthly_invoice_totals AS
WITH headers AS (
  SELECT
    EXTRACT(year  FROM invoice_date)::integer AS year,
    EXTRACT(month FROM invoice_date)::integer AS month,
    dealer_id,
    SUM(COALESCE(subtotal, 0)) AS subtotal,
    SUM(CASE WHEN lower(COALESCE(branch, '')) LIKE '%container%' THEN COALESCE(subtotal, 0) ELSE 0 END) AS subtotal_container,
    SUM(CASE WHEN lower(COALESCE(branch, '')) LIKE '%warehouse%' THEN COALESCE(subtotal, 0) ELSE 0 END) AS subtotal_warehouse
  FROM public.dealer_invoices
  WHERE invoice_date IS NOT NULL
  GROUP BY 1, 2, dealer_id
),
excluded AS (
  SELECT
    EXTRACT(year  FROM l.invoice_date)::integer AS year,
    EXTRACT(month FROM l.invoice_date)::integer AS month,
    l.dealer_id,
    SUM(COALESCE(l.extended_price, 0)) AS excluded_total
  FROM public.dealer_invoice_lines l
  WHERE l.invoice_date IS NOT NULL
    AND (
      COALESCE(lower(l.sku), '')          ~ 'tariff|freight|ecsur|processing fee'
      OR COALESCE(lower(l.product_name), '') ~ 'tariff|freight|ecsur|processing fee'
    )
  GROUP BY 1, 2, l.dealer_id
)
SELECT
  h.year,
  h.month,
  h.dealer_id,
  (h.subtotal - COALESCE(e.excluded_total, 0)) AS invoiced,
  h.subtotal_container AS invoiced_container,
  h.subtotal_warehouse AS invoiced_warehouse
FROM headers h
LEFT JOIN excluded e
  ON e.year = h.year AND e.month = h.month AND e.dealer_id IS NOT DISTINCT FROM h.dealer_id;

CREATE UNIQUE INDEX idx_dmit_year_month_dealer
  ON public.dealer_monthly_invoice_totals (year, month, dealer_id);

CREATE INDEX idx_dmit_dealer_id
  ON public.dealer_monthly_invoice_totals (dealer_id);

GRANT SELECT ON public.dealer_monthly_invoice_totals TO anon, authenticated;