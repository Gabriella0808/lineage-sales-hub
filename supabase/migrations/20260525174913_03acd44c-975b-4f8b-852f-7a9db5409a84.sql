
-- Permanent precomputed aggregate for dealer monthly invoice totals
-- Replace view with a materialized view + supporting indexes for fast loading.

-- Supporting indexes on join keys (idempotent)
CREATE INDEX IF NOT EXISTS idx_dealer_invoice_lines_invoice_acctivate_id
  ON public.dealer_invoice_lines (invoice_acctivate_id);
CREATE INDEX IF NOT EXISTS idx_dealer_invoice_lines_invoice_date
  ON public.dealer_invoice_lines (invoice_date);
CREATE INDEX IF NOT EXISTS idx_dealer_invoice_lines_dealer_id
  ON public.dealer_invoice_lines (dealer_id);
CREATE INDEX IF NOT EXISTS idx_dealer_invoices_acctivate_id
  ON public.dealer_invoices (acctivate_id);

-- Drop the existing view
DROP VIEW IF EXISTS public.dealer_monthly_invoice_totals;

-- Create as a materialized view for fast queries
CREATE MATERIALIZED VIEW public.dealer_monthly_invoice_totals AS
SELECT
  EXTRACT(year FROM l.invoice_date)::integer AS year,
  EXTRACT(month FROM l.invoice_date)::integer AS month,
  l.dealer_id,
  sum(l.extended_price) AS invoiced,
  sum(CASE WHEN lower(COALESCE(i.branch, '')) LIKE '%container%' THEN l.extended_price ELSE 0 END) AS invoiced_container,
  sum(CASE WHEN lower(COALESCE(i.branch, '')) LIKE '%warehouse%' THEN l.extended_price ELSE 0 END) AS invoiced_warehouse
FROM public.dealer_invoice_lines l
LEFT JOIN public.dealer_invoices i ON i.acctivate_id = l.invoice_acctivate_id
WHERE l.invoice_date IS NOT NULL
  AND l.extended_price IS NOT NULL
  AND NOT (
    COALESCE(lower(l.sku), '') ~ 'tariff|freight'
    OR COALESCE(lower(l.product_name), '') ~ 'tariff|freight'
  )
GROUP BY 1, 2, l.dealer_id;

-- Unique index enables CONCURRENT refresh and fast lookups
CREATE UNIQUE INDEX idx_dmit_year_month_dealer
  ON public.dealer_monthly_invoice_totals (year, month, dealer_id);

CREATE INDEX idx_dmit_dealer_id
  ON public.dealer_monthly_invoice_totals (dealer_id);

-- Grants so the app can read it
GRANT SELECT ON public.dealer_monthly_invoice_totals TO anon, authenticated;

-- Refresh helper callable from edge functions / sync jobs
CREATE OR REPLACE FUNCTION public.refresh_dealer_monthly_invoice_totals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.dealer_monthly_invoice_totals;
EXCEPTION WHEN OTHERS THEN
  -- Fallback to non-concurrent if concurrent isn't possible yet
  REFRESH MATERIALIZED VIEW public.dealer_monthly_invoice_totals;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_dealer_monthly_invoice_totals() TO authenticated;
