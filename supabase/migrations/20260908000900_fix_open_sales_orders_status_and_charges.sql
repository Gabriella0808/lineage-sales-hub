-- ══════════════════════════════════════════════════════════════════════════════
-- Fix two real bugs found during pre-deployment validation of
-- v_rep_open_sales_order_lines (20260908000100), against the actual live
-- Acctivate-replicated data:
--
-- BUG 1 — header-status filter was a silent no-op.
--   dbo_Orders."OrderStatus" stores single-LETTER codes, not words:
--     S = Scheduled, C = Completed, X = Cancelled, K = Backordered
--   (confirmed via dbo_Orders."OrderStatusDescription", which decodes them).
--   The original filter did `OrderStatus NOT ILIKE '%cancel%' / '%complet%' /
--   '%void%' / '%closed%'` — none of those patterns ever match a single
--   letter, so EVERY status passed, including the 67 Completed and 6
--   Cancelled orders live at validation time. Fixed by filtering on
--   OrderStatusDescription (the decoded text) instead of the coded field.
--
-- BUG 2 — MiscChargeType exclusion was dead code; SalesCategory is what's
--   actually populated.
--   dbo_OrderDetail."MiscChargeType" is NULL on every single row surveyed,
--   including confirmed freight/tariff/misc charge lines ("Tariff Surcharge",
--   "Customs Pass-Through") — so `MiscChargeType IS NULL OR blank` was true
--   for every row and excluded nothing. Freight=true correctly caught
--   "Freight Out:*" lines (kept), but TARIFF and MISC category lines were
--   NOT freight-flagged and leaked straight into the backlog total: at
--   validation time this was $100,881.78 of open TARIFF-category value and
--   $5,500.00 of open MISC-category value across the dataset.
--
--   Fix: exclude by od."SalesCategory" using the exact same list already
--   used for invoices/bookings everywhere else in this app — FREIGHTO, MISC,
--   SALESTAX, TARIFF. Surveyed the full distinct SalesCategory vocabulary on
--   dbo_OrderDetail (SW, FINNLOU, LUX, ALLOW, TARIFF, FREIGHTO, MISC, blank)
--   — no DRAYAGE/SURCHARGE/QC-coded category exists in this table, so no
--   guessed codes were added. Freight=true and LineCancelled=true are kept
--   as additional (now redundant-but-harmless) guards.
--
-- Everything else validated correct, unchanged:
--   • qty_open = QtyOrdered - QtyShipped matches native QtyBackordered
--     exactly in every sampled case; no line-level partial-shipment rows
--     exist in the data (fulfillment happens line-by-line within an order,
--     not gradually within a line), so this is the right remaining-qty calc.
--   • Amount == Price * QtyOrdered * (1 - LineDiscountPct/100) in every
--     discounted line sampled — Price is pre-discount, no double-discount
--     risk in net_open_amount = Price * (1-disc%) * qty_open.
--   • DISTINCT guid_order == DISTINCT OrderNumber for every rep checked —
--     order counts are genuinely distinct sales orders, not rows/lines.
--   • dbo_Order (singular) does not exist (confirmed 404, not just empty) —
--     dbo_Orders (plural) is the only, authoritative, actively-synced table;
--     every migration and sync script in this repo already agrees.
--
-- Rep-level impact of this fix (validated 2026-09-08):
--   Skip Camillo (Skip): 31 orders/$423,624.73 -> 29 orders/$389,977.83
--   Dave Ervin   (DE)  : 98 orders/$316,052.13 -> 93 orders/$304,480.69
--   Mike Durham  (MD)  : 45 orders/$247,919.21 -> 44 orders/$247,775.18
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_rep_open_sales_order_lines AS
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
  LOWER(REPLACE(REPLACE(o."GUIDOrder"::text, '{', ''), '}', ''))            AS guid_order,
  o."OrderNumber"::text                                                     AS order_number,
  o."OrderDate"::date                                                       AS order_date,
  o."RequestedShipDate"::date                                               AS requested_ship_date,
  o."CustomerID"::text                                                      AS customer_id,
  COALESCE(NULLIF(TRIM(dl.name::text), ''), o."CustomerID"::text)           AS dealer_name,
  COALESCE(NULLIF(TRIM(o."SalespersonID"), ''), NULLIF(TRIM(o."_Rep1"), ''), '') AS rep_id,
  COALESCE(
    NULLIF(TRIM(asr.name::text), ''),
    NULLIF(TRIM(o."SalespersonID"), ''),
    NULLIF(TRIM(o."_Rep1"), ''),
    'Unassigned'
  )                                                                          AS rep_name,
  o."BranchID"::text                                                        AS branch_id,
  CASE UPPER(COALESCE(o."BranchID", ''))
    WHEN 'MIXED'   THEN 'container'
    WHEN 'DIRECT'  THEN 'container'
    WHEN 'WHSALES' THEN 'warehouse'
    ELSE 'unclassified'
  END                                                                        AS fulfillment_type,
  od."Warehouse"::text                                                      AS warehouse,
  od."ProductID"::text                                                      AS sku,
  od."Description"::text                                                    AS description,
  od."ProductClass"::text                                                   AS product_class,
  od."SalesCategory"::text                                                  AS sales_category,
  CASE
    WHEN od."SalesCategory" = 'SW'                          THEN 'Sea Winds'
    WHEN od."SalesCategory" IN ('FL', 'FINNLOU')             THEN 'Finn & Lou'
    WHEN UPPER(COALESCE(od."SalesCategory", '')) = 'LUX'     THEN 'Lux'
    WHEN od."SalesCategory" = 'ALLOW'
      OR COALESCE(od."SalesCategory", '') = ''                THEN 'ALLOW'
    ELSE NULL
  END                                                                        AS brand_category,
  COALESCE(od."QtyOrdered"::numeric, 0)                                     AS qty_ordered,
  COALESCE(od."QtyShipped"::numeric, 0)                                     AS qty_shipped,
  GREATEST(COALESCE(od."QtyOrdered"::numeric, 0) - COALESCE(od."QtyShipped"::numeric, 0), 0) AS qty_open,
  COALESCE(od."Price"::numeric, 0)                                          AS unit_price,
  COALESCE(od."LineDiscountPct"::numeric, 0)                                AS line_discount_pct,
  ROUND(
    COALESCE(od."Price"::numeric, 0)
    * (1 - COALESCE(od."LineDiscountPct"::numeric, 0) / 100.0)
    * GREATEST(COALESCE(od."QtyOrdered"::numeric, 0) - COALESCE(od."QtyShipped"::numeric, 0), 0)
  , 2)                                                                       AS net_open_amount,
  rr.manager_id
FROM public."dbo_Orders" o
JOIN public."dbo_OrderDetail" od
  ON od."GUIDOrder" = o."GUIDOrder"
LEFT JOIN public.dealers dl
  ON dl.acctivate_id = o."CustomerID"
LEFT JOIN public.acctivate_sales_reps asr
  ON LOWER(TRIM(asr.acctivate_id)) = LOWER(TRIM(o."SalespersonID"))
LEFT JOIN real_reps rr
  ON LOWER(TRIM(rr.canonical_rep_key)) = LOWER(TRIM(
       COALESCE(NULLIF(TRIM(o."SalespersonID"), ''), NULLIF(TRIM(o."_Rep1"), ''), '')
     ))
WHERE o."OrderDate" IS NOT NULL
  AND COALESCE(o."OrderStatusDescription", '') NOT ILIKE '%cancel%'
  AND COALESCE(o."OrderStatusDescription", '') NOT ILIKE '%complet%'
  AND COALESCE(o."OrderStatusDescription", '') NOT ILIKE '%void%'
  AND COALESCE(o."OrderStatusDescription", '') NOT ILIKE '%closed%'
  AND COALESCE(od."Freight", false) IS NOT TRUE
  AND COALESCE(od."LineCancelled", false) IS NOT TRUE
  AND COALESCE(od."SalesCategory", '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF')
  AND (COALESCE(od."QtyOrdered"::numeric, 0) - COALESCE(od."QtyShipped"::numeric, 0)) > 0;

GRANT SELECT ON public.v_rep_open_sales_order_lines TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
-- ══════════════════════════════════════════════════════════════════════════════

-- SELECT rep_name, rep_id,
--   COUNT(DISTINCT guid_order) AS open_orders,
--   ROUND(SUM(net_open_amount), 2) AS total_open_value
-- FROM public.v_rep_open_sales_order_lines
-- WHERE rep_id IN ('Skip','DE','MD')
-- GROUP BY rep_name, rep_id ORDER BY total_open_value DESC;
--
-- Expected: Skip 29/$389,977.83 · DE 93/$304,480.69 · MD 44/$247,775.18
