-- kpi_monthly_portal_invoice_rollup
-- Reads invoiced actuals from portal_acctivate_invoices (Skyvia-synced).
-- If v_portal_monthly_invoiced_actuals exists it is preferred (pre-aggregated).
-- total_amount is stored as text and cast to numeric; only posted_to_ar = true rows.
-- No branch splits — invoiced_container / invoiced_warehouse returned as 0.

CREATE OR REPLACE FUNCTION public.kpi_monthly_portal_invoice_rollup(p_years int[])
RETURNS TABLE (
  year               int,
  month              int,
  invoiced           numeric,
  invoiced_container numeric,
  invoiced_warehouse numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _view_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM   information_schema.views
    WHERE  table_schema = 'public'
    AND    table_name   = 'v_portal_monthly_invoiced_actuals'
  ) INTO _view_exists;

  IF _view_exists THEN
    RETURN QUERY EXECUTE $q$
      SELECT
        v.year::int,
        v.month::int,
        COALESCE(v.invoiced::numeric,            0),
        COALESCE(v.invoiced_container::numeric,  0),
        COALESCE(v.invoiced_warehouse::numeric,  0)
      FROM public.v_portal_monthly_invoiced_actuals v
      WHERE v.year = ANY($1)
      ORDER BY 1, 2
    $q$ USING p_years;
    RETURN;
  END IF;

  -- Fall back: aggregate portal_acctivate_invoices directly.
  RETURN QUERY
  SELECT
    EXTRACT(YEAR  FROM p.invoice_date)::int                               AS year,
    EXTRACT(MONTH FROM p.invoice_date)::int                               AS month,
    COALESCE(SUM(NULLIF(trim(p.total_amount), '')::numeric), 0)          AS invoiced,
    0::numeric                                                            AS invoiced_container,
    0::numeric                                                            AS invoiced_warehouse
  FROM public.portal_acctivate_invoices p
  WHERE p.invoice_date IS NOT NULL
    AND EXTRACT(YEAR FROM p.invoice_date)::int = ANY(p_years)
    AND p.posted_to_ar = true
  GROUP BY 1, 2
  ORDER BY 1, 2;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kpi_monthly_portal_invoice_rollup(int[])
  TO anon, authenticated, service_role;
