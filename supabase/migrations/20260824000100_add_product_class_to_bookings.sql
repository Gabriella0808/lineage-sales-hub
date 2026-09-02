-- Wire product_class through the bookings pipeline so collection names come
-- strictly from Acctivate (dbo.ProductClass.Description), not from description
-- inference in the frontend.
--
-- Changes:
--   1. portal_acctivate_order_lines: add product_class text column
--   2. v_portal_bookings_line_facts: expose l.product_class (new column at end)
--   3. v_portal_dealer_rep_reporting_lines: use f.product_class for bookings rows
--      instead of the previous NULL::text placeholder
--
-- v_companywide_reporting_actuals and all RPCs already reference rl.product_class
-- so they pick up the real value automatically once this migration runs.
--
-- Note: as originally authored, this migration's CREATE OR REPLACE VIEW for
-- v_portal_bookings_line_facts dropped the customer_id column that
-- 20260821000200_fix_booking_customer_fields.sql had just added (CREATE OR
-- REPLACE VIEW cannot drop/reorder existing columns, only append). Restored
-- customer_id in its original position here, and restored the f.customer_id
-- preference in v_portal_dealer_rep_reporting_lines's customer_id/dealer_name
-- COALESCE chains so this migration doesn't silently undo that earlier fix.

-- ── 1. Schema ─────────────────────────────────────────────────────────────────

ALTER TABLE public.portal_acctivate_order_lines
  ADD COLUMN IF NOT EXISTS product_class text;

-- ── 2. v_portal_bookings_line_facts (add product_class at end) ───────────────

CREATE OR REPLACE VIEW public.v_portal_bookings_line_facts AS
SELECT
  o.guid_order::text                                            AS guid_order,
  o.guid_customer::text                                         AS guid_customer,
  o.guid_salesperson::text                                      AS guid_salesperson,
  date(o.order_date)                                            AS booking_date,
  o.sold_to_name::text                                          AS dealer_name,
  NULLIF(TRIM(o.customer_id::text), '')                         AS customer_id,
  o.rep1::text                                                  AS rep1,
  o.rep2::text                                                  AS rep2,
  l.product_id::text                                            AS sku,
  l.description::text                                           AS description,
  CASE l.sales_category
    WHEN 'SW'      THEN 'Sea Winds'
    WHEN 'FINNLOU' THEN 'Finn & Lou'
    WHEN 'LUX'     THEN 'Lux'
    WHEN 'ALLOW'   THEN 'MISC'
    ELSE l.sales_category
  END::text                                                     AS brand_category,
  CASE
    WHEN COALESCE(NULLIF(l.original_price, '')::numeric, 0) <> 0
    THEN
        COALESCE(l.qty_ordered::numeric,      0)
      * NULLIF(l.original_price, '')::numeric
      * (1.0 - COALESCE(l.line_discount_pct::numeric, 0) / 100.0)
    ELSE
        COALESCE(l.amount::numeric,           0)
      - COALESCE(l.tariff_amount::numeric,    0)
      - COALESCE(l.freight_amount::numeric,   0)
  END::numeric                                                  AS net_booking_amount,
  l.product_class::text                                         AS product_class
FROM public.portal_acctivate_orders o
JOIN public.portal_acctivate_order_lines l
  ON l.guid_order = o.guid_order
WHERE COALESCE(l.line_cancelled, false) = false
  AND l.sales_category IN ('SW', 'FINNLOU', 'LUX', 'HOSP', 'ALLOW', 'MISC');

GRANT SELECT ON public.v_portal_bookings_line_facts TO anon, authenticated;

-- ── 3. v_portal_dealer_rep_reporting_lines (use f.product_class for bookings) ─

CREATE OR REPLACE VIEW public.v_portal_dealer_rep_reporting_lines AS

WITH order_salesperson_lookup AS (
  SELECT
    TRIM(BOTH '{}' FROM LOWER("GUIDSalesperson"::text))   AS guid_salesperson_norm,
    MAX(NULLIF(TRIM("SalespersonID"::text),   ''))         AS salesperson_id,
    MAX(NULLIF(TRIM("SalespersonName"::text), ''))         AS salesperson_name
  FROM public."dbo_Orders"
  WHERE "GUIDSalesperson" IS NOT NULL
  GROUP BY TRIM(BOTH '{}' FROM LOWER("GUIDSalesperson"::text))
),
customer_lookup AS (
  SELECT
    LOWER("GUIDCustomer"::text)                            AS guid_customer_norm,
    MAX(NULLIF(TRIM("CustomerID"::text), ''))               AS customer_id
  FROM public."dbo_Orders"
  WHERE "GUIDCustomer" IS NOT NULL
  GROUP BY LOWER("GUIDCustomer"::text)
),
unique_dealer_name_lookup AS (
  SELECT
    LOWER(TRIM(name))  AS name_norm,
    MIN(acctivate_id)  AS acctivate_id
  FROM public.dealers
  GROUP BY LOWER(TRIM(name))
  HAVING COUNT(*) = 1
)

SELECT
  'bookings'::text                                                               AS metric_type,
  f.booking_date::date                                                           AS transaction_date,
  EXTRACT(YEAR  FROM f.booking_date)::int                                        AS year,
  EXTRACT(MONTH FROM f.booking_date)::int                                        AS month_number,
  COALESCE(
    NULLIF(TRIM(f.dealer_name::text), ''),
    NULLIF(TRIM(o."CustomerID"::text), ''),
    cl.customer_id,
    udl.acctivate_id
  )                                                                              AS dealer_name,
  COALESCE(
    f.customer_id,
    NULLIF(TRIM(o."CustomerID"::text), ''),
    cl.customer_id,
    udl.acctivate_id
  )                                                                              AS customer_id,
  COALESCE(
    osl.salesperson_name,
    NULLIF(o."SalespersonName"::text, ''),
    NULLIF(o."_Rep1"::text,           ''),
    NULLIF(o."_Rep2"::text,           ''),
    NULLIF(f.rep1::text,              ''),
    NULLIF(f.rep2::text,              ''),
    'Unassigned'
  )::text                                                                        AS rep_name,
  COALESCE(NULLIF(osl.salesperson_id, ''), NULLIF(f.rep1::text, ''),
           f.guid_salesperson::text)::text                                       AS rep_id,
  f.sku::text                                                                    AS sku,
  f.description::text                                                            AS description,
  f.brand_category::text                                                         AS brand_category,
  f.product_class::text                                                          AS product_class,
  f.net_booking_amount::numeric                                                  AS amount,
  NULL::text                                                                     AS invoice_number
FROM public.v_portal_bookings_line_facts f
LEFT JOIN public."dbo_Orders" o
  ON TRIM(BOTH '{}' FROM LOWER(o."GUIDOrder"::text)) = LOWER(f.guid_order)
LEFT JOIN order_salesperson_lookup osl
  ON osl.guid_salesperson_norm = TRIM(BOTH '{}' FROM LOWER(f.guid_salesperson::text))
LEFT JOIN customer_lookup cl
  ON cl.guid_customer_norm = LOWER(f.guid_customer)
LEFT JOIN unique_dealer_name_lookup udl
  ON udl.name_norm = LOWER(TRIM(f.dealer_name))
WHERE f.booking_date IS NOT NULL

UNION ALL

SELECT
  metric_type, transaction_date, year, month_number,
  dealer_name, customer_id, rep_name, rep_id,
  sku, description, brand_category, product_class, amount, invoice_number
FROM public.get_portal_invoiced_lines();

GRANT SELECT ON public.v_portal_dealer_rep_reporting_lines TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
