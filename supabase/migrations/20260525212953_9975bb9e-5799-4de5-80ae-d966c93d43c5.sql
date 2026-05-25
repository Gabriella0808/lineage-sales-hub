
CREATE OR REPLACE FUNCTION public.kpi_dealer_monthly_invoiced(
  p_years int[]
)
RETURNS TABLE (
  dealer_id uuid,
  year int,
  month int,
  invoiced numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.dealer_id,
    t.year::int,
    t.month::int,
    COALESCE(SUM(t.invoiced), 0)::numeric
  FROM public.dealer_monthly_invoice_totals t
  WHERE t.year = ANY(p_years)
    AND t.dealer_id IS NOT NULL
  GROUP BY t.dealer_id, t.year, t.month;
$$;

GRANT EXECUTE ON FUNCTION public.kpi_dealer_monthly_invoiced(int[]) TO anon, authenticated;
