
CREATE OR REPLACE FUNCTION public.kpi_monthly_invoice_rollup(
  p_years int[],
  p_dealer_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  year int,
  month int,
  invoiced numeric,
  invoiced_container numeric,
  invoiced_warehouse numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.year::int,
    t.month::int,
    COALESCE(SUM(t.invoiced), 0)::numeric AS invoiced,
    COALESCE(SUM(t.invoiced_container), 0)::numeric AS invoiced_container,
    COALESCE(SUM(t.invoiced_warehouse), 0)::numeric AS invoiced_warehouse
  FROM public.dealer_monthly_invoice_totals t
  WHERE t.year = ANY(p_years)
    AND (p_dealer_ids IS NULL OR t.dealer_id = ANY(p_dealer_ids))
  GROUP BY t.year, t.month;
$$;

GRANT EXECUTE ON FUNCTION public.kpi_monthly_invoice_rollup(int[], uuid[]) TO anon, authenticated;
