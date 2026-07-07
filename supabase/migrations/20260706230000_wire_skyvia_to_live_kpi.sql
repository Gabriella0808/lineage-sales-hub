-- Wire Skyvia-replicated Acctivate tables to the Live KPI section.
--
-- 1. Replace kpi_monthly_invoice_rollup to read from dbo_Invoice +
--    dbo_InvoiceDetail instead of the (empty) dealer_monthly_invoice_totals view.
--
-- 2. Backfill dealer_sales.bookings from dbo_OrderManagementSummary so the
--    bookings chart shows real Acctivate data.

-- ─── 1. Invoice rollup function ───────────────────────────────────────────────

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
    -- Sum only true product lines per invoice; exclude:
    --   • freight lines (Freight = true)
    --   • misc-charge lines (MiscChargeType is set)
    --   • cancelled lines
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
    AND COALESCE(i."PostedToAR", false) IS TRUE
    -- For company-wide (null) include all; for rep-specific filter by dealer uuid
    AND (p_dealer_ids IS NULL OR dl.id = ANY(p_dealer_ids))
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

GRANT EXECUTE ON FUNCTION public.kpi_monthly_invoice_rollup(int[], uuid[])
  TO anon, authenticated, service_role;

-- ─── 2. Backfill dealer_sales bookings from dbo_OrderManagementSummary ────────
--
-- Only orders whose CustomerID maps to a known dealer (via acctivate_id) are
-- inserted. Company-wide totals are computed by summing all dealer rows.

INSERT INTO public.dealer_sales (dealer_id, year, month, bookings, booking_count)
SELECT
  dl.id                                            AS dealer_id,
  EXTRACT(YEAR  FROM o."OrderDate")::int           AS year,
  EXTRACT(MONTH FROM o."OrderDate")::text          AS month,
  SUM(o."SubTotal"::numeric)                       AS bookings,
  COUNT(*)                                         AS booking_count
FROM public."dbo_OrderManagementSummary" o
JOIN public.dealers dl ON dl.acctivate_id = o."CustomerID"
WHERE o."OrderDate" IS NOT NULL
  AND COALESCE(o."OrderStatus", '') <> 'Cancelled'
  AND o."SubTotal" IS NOT NULL
GROUP BY dl.id,
         EXTRACT(YEAR  FROM o."OrderDate")::int,
         EXTRACT(MONTH FROM o."OrderDate")::text
ON CONFLICT (dealer_id, year, month)
DO UPDATE SET
  bookings      = EXCLUDED.bookings,
  booking_count = EXCLUDED.booking_count,
  updated_at    = now();
