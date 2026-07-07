-- Fix: remove PostedToAR filter — all invoices in this Acctivate installation
-- have PostedToAR = false (AR posting workflow is not used), so the previous
-- filter excluded every row. Use InvoiceDate presence as the only gate.

CREATE OR REPLACE FUNCTION public.kpi_monthly_invoice_rollup(
  p_years      int[],
  p_dealer_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  year               int,
  month              int,
  invoiced           numeric,
  invoiced_container numeric,
  invoiced_warehouse numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH product_lines AS (
    SELECT
      d."GUIDInvoice",
      SUM(d."Amount"::numeric) AS product_subtotal
    FROM public."dbo_InvoiceDetail" d
    WHERE COALESCE(d."Freight",       false) IS NOT TRUE
      AND COALESCE(d."LineCancelled", false) IS NOT TRUE
      AND (d."MiscChargeType" IS NULL OR trim(d."MiscChargeType") = '')
    GROUP BY d."GUIDInvoice"
  )
  SELECT
    EXTRACT(YEAR  FROM i."InvoiceDate")::int AS year,
    EXTRACT(MONTH FROM i."InvoiceDate")::int AS month,
    COALESCE(SUM(pl.product_subtotal), 0) AS invoiced,
    COALESCE(SUM(CASE
      WHEN lower(COALESCE(i."BranchID", '')) LIKE '%container%'
      THEN pl.product_subtotal ELSE 0
    END), 0) AS invoiced_container,
    COALESCE(SUM(CASE
      WHEN lower(COALESCE(i."BranchID", '')) LIKE '%warehouse%'
      THEN pl.product_subtotal ELSE 0
    END), 0) AS invoiced_warehouse
  FROM public."dbo_Invoice" i
  JOIN product_lines pl ON pl."GUIDInvoice" = i."GUIDInvoice"
  LEFT JOIN public.dealers dl ON dl.acctivate_id = i."CustomerID"
  WHERE EXTRACT(YEAR FROM i."InvoiceDate")::int = ANY(p_years)
    AND i."InvoiceDate" IS NOT NULL
    AND (p_dealer_ids IS NULL OR dl.id = ANY(p_dealer_ids))
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

GRANT EXECUTE ON FUNCTION public.kpi_monthly_invoice_rollup(int[], uuid[])
  TO anon, authenticated, service_role;
