-- ══════════════════════════════════════════════════════════════════════════════
-- Fix invoice display_category to match Andrew's DailyInvoices SUMIFS exactly.
--
-- Andrew's workbook (RAWMONTH → DailyInvoices SUMIFS):
--   Sea Winds   : Product.SalesCategory = 'SW'
--   Finn&Louise : Product.SalesCategory = 'FINNLOU'   (case-insensitive in Excel;
--                                                       'FL' is NOT in the formula)
--   Lux         : UPPER(Product.SalesCategory) = 'LUX' (formula uses 'Lux')
--   MISC        : Product.SalesCategory = 'ALLOW'
--              OR Product.SalesCategory = ''  (blank / NULL stored as empty string)
--   Other Included : anything else passing the exclude filter (e.g. 'FL' if present)
--
-- Source-level exclude filter (Power Query, already applied since migration 000200):
--   COALESCE(product_sales_category,'') NOT IN ('FREIGHTO','MISC','SALESTAX','TARIFF')
--
-- Live KPI MTD total = Sea Winds + Finn&Louise + Lux + MISC
--   (= all rows passing the exclude filter, because 'Other Included' is empty in
--    current 2026 data — all Finn & Lou products now carry SalesCategory = FINNLOU)
--
-- CREATE OR REPLACE VIEW is safe here: column names/types are unchanged; only the
-- CASE expression inside display_category is corrected.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_portal_invoice_line_facts AS
SELECT
  d.invoice_date,
  d.invoice_number,
  d.customer_id,
  COALESCE(
    NULLIF(TRIM(dl.name::text), ''),
    d.customer_id
  )                                                       AS dealer_name,
  COALESCE(
    NULLIF(TRIM(asr.name::text),           ''),
    NULLIF(TRIM(pai.sales_rep_name::text), ''),
    NULLIF(TRIM(pai.sales_rep_id::text),   ''),
    NULLIF(TRIM(d.sales_rep_id),           ''),
    'Unassigned'
  )                                                       AS salesperson_name,
  COALESCE(NULLIF(TRIM(d.sales_rep_id), ''), '')         AS salesperson_id,
  d.product_id,
  d.description,
  d.product_sales_category                               AS sales_category,
  -- Andrew-exact category mapping (mirrors DailyInvoices SUMIFS logic)
  CASE
    WHEN d.product_sales_category = 'SW'
      THEN 'Sea Winds'
    WHEN d.product_sales_category = 'FINNLOU'
      THEN 'Finn & Louise'
    WHEN UPPER(d.product_sales_category) = 'LUX'
      THEN 'Lux'
    WHEN d.product_sales_category = 'ALLOW'
      OR COALESCE(d.product_sales_category, '') = ''
      THEN 'MISC'
    ELSE 'Other Included'
  END                                                     AS display_category,
  d.product_class::text                                   AS product_class,
  COALESCE(d.price,             0)::numeric               AS price,
  COALESCE(d.qty_invoiced,      0)::numeric               AS qty_invoiced,
  COALESCE(d.line_discount_pct, 0)::numeric               AS line_discount_pct,
  COALESCE(d.formula_net_amount,0)::numeric               AS net_invoice_amount,
  COALESCE(d.invoice_type, '')::text                      AS invoice_type,
  CASE COALESCE(d.invoice_type, '')
    WHEN 'O' THEN 'Invoice'
    WHEN 'C' THEN 'CreditMemo'
    ELSE COALESCE(d.invoice_type, '')
  END                                                     AS invoice_type_label
FROM public.acctivate_invoice_lines_2026_direct d
LEFT JOIN public.dealers dl
  ON dl.acctivate_id = d.customer_id
LEFT JOIN public.portal_acctivate_invoices pai
  ON pai.guid_invoice::text = d.guid_invoice
LEFT JOIN public.acctivate_sales_reps asr
  ON LOWER(TRIM(asr.acctivate_id)) = LOWER(TRIM(d.sales_rep_id))
WHERE d.invoice_date IS NOT NULL
  AND d.invoice_date >= '2026-01-01'
  AND COALESCE(d.product_sales_category, '') NOT IN ('FREIGHTO', 'MISC', 'SALESTAX', 'TARIFF');

GRANT SELECT ON public.v_portal_invoice_line_facts TO authenticated, anon, service_role;

NOTIFY pgrst, 'reload schema';
