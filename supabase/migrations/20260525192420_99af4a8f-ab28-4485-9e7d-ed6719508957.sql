DROP MATERIALIZED VIEW IF EXISTS public.dealer_monthly_invoice_totals;

CREATE MATERIALIZED VIEW public.dealer_monthly_invoice_totals AS
WITH invoice_excluded AS (
  SELECT
    l.invoice_acctivate_id,
    SUM(COALESCE(l.extended_price, 0)) AS excluded_total
  FROM public.dealer_invoice_lines l
  WHERE l.invoice_acctivate_id IS NOT NULL
    AND (
      COALESCE(lower(l.sku), '')          ~ 'tariff|freight|ecsur|processing fee'
      OR COALESCE(lower(l.product_name), '') ~ 'tariff|freight|ecsur|processing fee'
    )
  GROUP BY l.invoice_acctivate_id
)
SELECT
  EXTRACT(year  FROM i.invoice_date)::integer AS year,
  EXTRACT(month FROM i.invoice_date)::integer AS month,
  i.dealer_id,
  SUM(COALESCE(i.subtotal, 0) - COALESCE(ie.excluded_total, 0)) AS invoiced,
  SUM(CASE WHEN lower(COALESCE(i.branch, '')) LIKE '%container%'
           THEN COALESCE(i.subtotal, 0) - COALESCE(ie.excluded_total, 0) ELSE 0 END) AS invoiced_container,
  SUM(CASE WHEN lower(COALESCE(i.branch, '')) LIKE '%warehouse%'
           THEN COALESCE(i.subtotal, 0) - COALESCE(ie.excluded_total, 0) ELSE 0 END) AS invoiced_warehouse
FROM public.dealer_invoices i
LEFT JOIN invoice_excluded ie ON ie.invoice_acctivate_id = i.acctivate_id
WHERE i.invoice_date IS NOT NULL
GROUP BY 1, 2, i.dealer_id;

CREATE UNIQUE INDEX idx_dmit_year_month_dealer
  ON public.dealer_monthly_invoice_totals (year, month, dealer_id);

CREATE INDEX idx_dmit_dealer_id
  ON public.dealer_monthly_invoice_totals (dealer_id);

GRANT SELECT ON public.dealer_monthly_invoice_totals TO anon, authenticated;