-- Exclude freight/tax/surcharge categories from v_portal_bookings_line_facts.
--
-- Only these sales_category values count as bookings:
--   SW, FINNLOU, LUX, HOSP, ALLOW, MISC
--
-- Excluded (freight, tariff, surcharges, blanks):
--   FREIGHTO, TARIFF, SALESTAX, CCFEE, NULL, ''
--
-- Formula and line_cancelled filter unchanged from 20260819000400.
-- Full drop+recreate to avoid CREATE OR REPLACE column-count conflicts.

BEGIN;

DROP VIEW             IF EXISTS public.v_companywide_reporting_actuals;
DROP VIEW             IF EXISTS public.v_portal_dealer_rep_reporting_lines;
DROP MATERIALIZED VIEW IF EXISTS public.mv_portal_monthly_net_bookings_actuals;
DROP VIEW             IF EXISTS public.v_portal_bookings_line_facts;

-- ─────────────────────────────────────────────────────────────────────────────
-- v_portal_bookings_line_facts
-- ─────────────────────────────────────────────────────────────────────────────

CREATE VIEW public.v_portal_bookings_line_facts AS
SELECT
  o.guid_order::text                                            AS guid_order,
  o.guid_customer::text                                         AS guid_customer,
  o.guid_salesperson::text                                      AS guid_salesperson,
  date(o.order_date)                                            AS booking_date,
  o.sold_to_name::text                                          AS dealer_name,
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
  END::numeric                                                  AS net_booking_amount
FROM public.portal_acctivate_orders o
JOIN public.portal_acctivate_order_lines l
  ON l.guid_order = o.guid_order
WHERE COALESCE(l.line_cancelled, false) = false
  AND l.sales_category IN ('SW', 'FINNLOU', 'LUX', 'HOSP', 'ALLOW', 'MISC');

GRANT SELECT ON public.v_portal_bookings_line_facts TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- v_portal_dealer_rep_reporting_lines  (unchanged from 20260817000200)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE VIEW public.v_portal_dealer_rep_reporting_lines AS
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
  COALESCE(f.dealer_name::text, o."CustomerID"::text, cl.customer_id,
           udl.acctivate_id)                                                     AS dealer_name,
  COALESCE(o."CustomerID"::text, cl.customer_id, udl.acctivate_id)              AS customer_id,
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
  sku, description, brand_category, amount, invoice_number
FROM public.get_portal_invoiced_lines();

GRANT SELECT ON public.v_portal_dealer_rep_reporting_lines TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- v_companywide_reporting_actuals  (unchanged from 20260818000300)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE VIEW public.v_companywide_reporting_actuals AS
WITH real_reps AS (
  SELECT
    sr.id           AS portal_rep_id,
    sr.name         AS canonical_rep_name,
    sr.acctivate_id AS canonical_rep_key,
    sr.manager_id
  FROM public.sales_reps sr
  WHERE
    NULLIF(TRIM(sr.acctivate_id), '') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.territories t
      WHERE LOWER(TRIM(t.name)) = LOWER(TRIM(sr.name))
    )
)
SELECT
  rl.metric_type,
  rl.transaction_date,
  rl.year,
  rl.month_number,
  rl.dealer_name,
  rl.customer_id,
  rl.rep_id,
  rl.rep_name,
  rl.sku,
  rl.description,
  rl.brand_category,
  rl.amount,
  rl.invoice_number,
  rr.portal_rep_id,
  rr.canonical_rep_name,
  rr.canonical_rep_key,
  rr.manager_id,
  m.name AS manager_name
FROM public.v_portal_dealer_rep_reporting_lines rl
LEFT JOIN real_reps rr
  ON  NULLIF(TRIM(rl.rep_id), '') IS NOT NULL
  AND LOWER(TRIM(rr.canonical_rep_key)) = LOWER(TRIM(rl.rep_id))
LEFT JOIN public.managers m ON m.id = rr.manager_id;

GRANT SELECT ON public.v_companywide_reporting_actuals TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- mv_portal_monthly_net_bookings_actuals  (unchanged from 20260814006000)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE MATERIALIZED VIEW public.mv_portal_monthly_net_bookings_actuals AS
SELECT
  EXTRACT(YEAR  FROM f.booking_date)::int                                   AS year,
  EXTRACT(MONTH FROM f.booking_date)::int                                   AS month_number,
  COALESCE(SUM(f.net_booking_amount), 0)                                    AS net_bookings_actual,
  COALESCE(SUM(
    CASE WHEN bos.branch_id = 'MIXED'   THEN f.net_booking_amount ELSE 0 END
  ), 0)                                                                      AS container_bookings_actual,
  COALESCE(SUM(
    CASE WHEN bos.branch_id = 'WHSALES' THEN f.net_booking_amount ELSE 0 END
  ), 0)                                                                      AS warehouse_bookings_actual
FROM public.v_portal_bookings_line_facts f
LEFT JOIN public.booking_orders_sync bos
  ON bos.guid_order::text = f.guid_order::text
WHERE f.booking_date IS NOT NULL
GROUP BY 1, 2
ORDER BY 1, 2
WITH DATA;

CREATE UNIQUE INDEX ON public.mv_portal_monthly_net_bookings_actuals (year, month_number);

GRANT SELECT ON public.mv_portal_monthly_net_bookings_actuals TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_mv_portal_bookings()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_portal_monthly_net_bookings_actuals;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_mv_portal_bookings() TO service_role;

COMMIT;

SELECT public.refresh_mv_portal_bookings();
NOTIFY pgrst, 'reload schema';
