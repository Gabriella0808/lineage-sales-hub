CREATE OR REPLACE VIEW public.dealer_monthly_invoice_totals
WITH (security_invoker = on) AS
SELECT
  EXTRACT(YEAR  FROM l.invoice_date)::int  AS year,
  EXTRACT(MONTH FROM l.invoice_date)::int  AS month,
  l.dealer_id,
  SUM(l.extended_price)::numeric AS invoiced,
  SUM(CASE WHEN lower(coalesce(i.branch,'')) LIKE '%container%' THEN l.extended_price ELSE 0 END)::numeric AS invoiced_container,
  SUM(CASE WHEN lower(coalesce(i.branch,'')) LIKE '%warehouse%' THEN l.extended_price ELSE 0 END)::numeric AS invoiced_warehouse
FROM public.dealer_invoice_lines l
LEFT JOIN public.dealer_invoices i
  ON i.acctivate_id = l.invoice_acctivate_id
WHERE l.invoice_date IS NOT NULL
  AND l.extended_price IS NOT NULL
  AND NOT (
       coalesce(lower(l.sku), '')          ~ 'tariff|freight'
    OR coalesce(lower(l.product_name), '') ~ 'tariff|freight'
  )
GROUP BY 1, 2, 3;

GRANT SELECT ON public.dealer_monthly_invoice_totals TO anon, authenticated;