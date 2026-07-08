-- Include open orders (dbo_Orders) in the invoiced rollup alongside completed invoices.
-- This gives total committed revenue: what's been billed + what's still on order.

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
  ),
  -- Completed invoices classified by GUIDBranch
  invoice_agg AS (
    SELECT
      EXTRACT(YEAR  FROM i."InvoiceDate")::int AS year,
      EXTRACT(MONTH FROM i."InvoiceDate")::int AS month,
      COALESCE(SUM(pl.product_subtotal), 0) AS total,
      COALESCE(SUM(CASE
        WHEN i."GUIDBranch" = 'C96A46A5-7EDC-4B33-AF2E-A0BB16D91320'::uuid
        THEN pl.product_subtotal ELSE 0 END), 0) AS total_container,
      COALESCE(SUM(CASE
        WHEN i."GUIDBranch" IN (
          'E38CF43B-F51F-45BB-B6F3-862ACFCF951F'::uuid,
          '245DDE60-3911-48EA-9A77-C730843CD8E2'::uuid
        ) THEN pl.product_subtotal ELSE 0 END), 0) AS total_warehouse,
      COUNT(*)::int AS cnt
    FROM public."dbo_Invoice" i
    JOIN product_lines pl ON pl."GUIDInvoice" = i."GUIDInvoice"
    LEFT JOIN public.dealers dl ON dl.acctivate_id = i."CustomerID"
    WHERE EXTRACT(YEAR FROM i."InvoiceDate")::int = ANY(p_years)
      AND i."InvoiceDate" IS NOT NULL
      AND (p_dealer_ids IS NULL OR dl.id = ANY(p_dealer_ids))
    GROUP BY 1, 2
  ),
  -- Open orders (not yet invoiced) classified by BranchID
  order_agg AS (
    SELECT
      EXTRACT(YEAR  FROM o."OrderDate")::int AS year,
      EXTRACT(MONTH FROM o."OrderDate")::int AS month,
      COALESCE(SUM(o."SubTotal"::numeric), 0) AS total,
      COALESCE(SUM(CASE WHEN o."BranchID" = 'MIXED'   THEN o."SubTotal"::numeric ELSE 0 END), 0) AS total_container,
      COALESCE(SUM(CASE WHEN o."BranchID" = 'WHSALES' THEN o."SubTotal"::numeric ELSE 0 END), 0) AS total_warehouse,
      COUNT(*)::int AS cnt
    FROM public."dbo_Orders" o
    LEFT JOIN public.dealers dl ON dl.acctivate_id = o."CustomerID"
    WHERE EXTRACT(YEAR FROM o."OrderDate")::int = ANY(p_years)
      AND o."OrderDate" IS NOT NULL
      AND COALESCE(o."OrderStatus", '') NOT ILIKE '%cancel%'
      AND (p_dealer_ids IS NULL OR dl.id = ANY(p_dealer_ids))
    GROUP BY 1, 2
  ),
  all_months AS (
    SELECT year, month FROM invoice_agg
    UNION
    SELECT year, month FROM order_agg
  )
  SELECT
    m.year,
    m.month,
    COALESCE(ia.total, 0)           + COALESCE(oa.total, 0)           AS invoiced,
    COALESCE(ia.total_container, 0) + COALESCE(oa.total_container, 0) AS invoiced_container,
    COALESCE(ia.total_warehouse, 0) + COALESCE(oa.total_warehouse, 0) AS invoiced_warehouse,
    COALESCE(ia.cnt, 0)             + COALESCE(oa.cnt, 0)             AS invoice_count
  FROM all_months m
  LEFT JOIN invoice_agg ia ON ia.year = m.year AND ia.month = m.month
  LEFT JOIN order_agg  oa ON oa.year = m.year AND oa.month = m.month
  ORDER BY 1, 2;
$$;

GRANT EXECUTE ON FUNCTION public.kpi_monthly_invoice_rollup(int[], uuid[])
  TO anon, authenticated, service_role;
