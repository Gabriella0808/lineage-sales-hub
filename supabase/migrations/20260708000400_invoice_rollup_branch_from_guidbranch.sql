-- Use GUIDBranch on dbo_Invoice for branch classification.
-- GUIDBranch is populated on all historical invoices; BranchID (text) is not.
-- GUID mapping from Acctivate tbBranch:
--   E38CF43B-F51F-45BB-B6F3-862ACFCF951F = WHSALES (warehouse, current)
--   245DDE60-3911-48EA-9A77-C730843CD8E2 = WHSALES (warehouse, legacy — 35,838 historical invoices
--                                           use this GUID from before the branch was recreated)
--   C96A46A5-7EDC-4B33-AF2E-A0BB16D91320 = MIXED   (container)
--   78AF330D-4A54-4ED7-A423-A61E52056EBC = DIRECT

CREATE OR REPLACE FUNCTION public.kpi_monthly_invoice_rollup(
  p_years      int[],
  p_dealer_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  year               int,
  month              int,
  invoiced           numeric,
  invoiced_container numeric,
  invoiced_warehouse numeric,
  invoice_count      int
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
    COALESCE(SUM(pl.product_subtotal), 0)    AS invoiced,
    COALESCE(SUM(CASE
      WHEN i."GUIDBranch" = 'C96A46A5-7EDC-4B33-AF2E-A0BB16D91320'::uuid
      THEN pl.product_subtotal ELSE 0
    END), 0) AS invoiced_container,
    COALESCE(SUM(CASE
      WHEN i."GUIDBranch" IN (
        'E38CF43B-F51F-45BB-B6F3-862ACFCF951F'::uuid,  -- WHSALES current
        '245DDE60-3911-48EA-9A77-C730843CD8E2'::uuid   -- WHSALES legacy
      )
      THEN pl.product_subtotal ELSE 0
    END), 0) AS invoiced_warehouse,
    COUNT(*)::int AS invoice_count
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
