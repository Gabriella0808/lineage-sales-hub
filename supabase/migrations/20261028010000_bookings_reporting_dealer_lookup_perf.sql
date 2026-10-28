-- Perf fix: Bookings on Company-Wide / Dealer / Rep Reporting showing
-- "No booking data" (statement timeout, swallowed by the frontend).
--
-- v_portal_dealer_rep_reporting_lines' bookings branch LEFT JOINed a
-- unique_dealer_name_lookup CTE on dealer name. The planner misestimates
-- the booking order count (11 vs ~2,500 for Jul-Oct) and picks a nested
-- loop: 3.36M name comparisons, ~3.2s of a 3.5s get_sales_reporting_
-- grouped_rows('bookings') call. With several such calls fired in
-- parallel per page load that crosses the 8s authenticated timeout.
--
-- That lookup is only ever the LAST fallback in two COALESCEs (dealer_name,
-- customer_id), so it's replaced with a correlated scalar subquery in
-- those same positions - evaluated only for rows where every earlier
-- argument is NULL. Same semantics: min(acctivate_id) when exactly one
-- dealer has that normalised name, else NULL.
--
-- Validated before deploy: EXCEPT ALL of old view vs new body over all
-- bookings rows = 0 in both directions; Jul-Oct bookings sum went from
-- 3,472ms to 60ms. Invoiced branch copied verbatim from pg_get_viewdef.

BEGIN;

CREATE OR REPLACE VIEW public.v_portal_dealer_rep_reporting_lines AS
 WITH order_salesperson_lookup AS (
         SELECT TRIM(BOTH '{}'::text FROM lower(o."GUIDSalesperson"::text)) AS guid_salesperson_norm,
            max(NULLIF(TRIM(BOTH FROM o."SalespersonID"::text), ''::text)) AS salesperson_id,
            max(NULLIF(TRIM(BOTH FROM o."SalespersonName"::text), ''::text)) AS salesperson_name
           FROM "dbo_Orders" o
          WHERE o."GUIDSalesperson" IS NOT NULL
          GROUP BY (TRIM(BOTH '{}'::text FROM lower(o."GUIDSalesperson"::text)))
        ), customer_lookup AS (
         SELECT lower(o."GUIDCustomer"::text) AS guid_customer_norm,
            max(NULLIF(TRIM(BOTH FROM o."CustomerID"::text), ''::text)) AS customer_id
           FROM "dbo_Orders" o
          WHERE o."GUIDCustomer" IS NOT NULL
          GROUP BY (lower(o."GUIDCustomer"::text))
        )
 SELECT 'bookings'::text AS metric_type,
    f.booking_date AS transaction_date,
    EXTRACT(year FROM f.booking_date)::integer AS year,
    EXTRACT(month FROM f.booking_date)::integer AS month_number,
    COALESCE(f.dealer_name, o."CustomerID"::text, cl.customer_id, (SELECT min(d.acctivate_id) AS min
           FROM dealers d
          WHERE lower(TRIM(BOTH FROM d.name)) = lower(TRIM(BOTH FROM f.dealer_name))
         HAVING count(*) = 1)) AS dealer_name,
    COALESCE(f.customer_id, o."CustomerID"::text, cl.customer_id, (SELECT min(d.acctivate_id) AS min
           FROM dealers d
          WHERE lower(TRIM(BOTH FROM d.name)) = lower(TRIM(BOTH FROM f.dealer_name))
         HAVING count(*) = 1)) AS customer_id,
    COALESCE(osl.salesperson_name, NULLIF(o."SalespersonName"::text, ''::text), NULLIF(o."_Rep1"::text, ''::text), NULLIF(o."_Rep2"::text, ''::text), NULLIF(f.rep1, ''::text), NULLIF(f.rep2, ''::text), 'Unassigned'::text) AS rep_name,
    COALESCE(NULLIF(osl.salesperson_id, ''::text), NULLIF(f.rep1, ''::text), f.guid_salesperson) AS rep_id,
    f.sku,
    f.description,
    f.brand_category,
    f.product_class,
    f.net_booking_amount AS amount,
    NULL::text AS invoice_number,
    NULL::text AS invoice_type,
    f.fulfillment_type,
    f.discount_code
   FROM v_portal_bookings_line_facts f
     LEFT JOIN "dbo_Orders" o ON TRIM(BOTH '{}'::text FROM lower(o."GUIDOrder"::text)) = lower(f.guid_order)
     LEFT JOIN order_salesperson_lookup osl ON osl.guid_salesperson_norm = TRIM(BOTH '{}'::text FROM lower(f.guid_salesperson))
     LEFT JOIN customer_lookup cl ON cl.guid_customer_norm = lower(f.guid_customer)
  WHERE f.booking_date IS NOT NULL
UNION ALL
 SELECT get_portal_invoiced_lines.metric_type,
    get_portal_invoiced_lines.transaction_date,
    get_portal_invoiced_lines.year,
    get_portal_invoiced_lines.month_number,
    get_portal_invoiced_lines.dealer_name,
    get_portal_invoiced_lines.customer_id,
    get_portal_invoiced_lines.rep_name,
    get_portal_invoiced_lines.rep_id,
    get_portal_invoiced_lines.sku,
    get_portal_invoiced_lines.description,
    get_portal_invoiced_lines.brand_category,
    get_portal_invoiced_lines.product_class,
    get_portal_invoiced_lines.amount,
    get_portal_invoiced_lines.invoice_number,
    get_portal_invoiced_lines.invoice_type,
    get_portal_invoiced_lines.fulfillment_type,
    get_portal_invoiced_lines.discount_code
   FROM get_portal_invoiced_lines() get_portal_invoiced_lines(metric_type, transaction_date, year, month_number, dealer_name, customer_id, rep_name, rep_id, sku, description, brand_category, product_class, amount, invoice_number, invoice_type, fulfillment_type, discount_code);

COMMIT;
