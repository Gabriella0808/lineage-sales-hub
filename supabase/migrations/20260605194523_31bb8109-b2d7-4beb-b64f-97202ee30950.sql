ALTER TABLE public.dealers
  ADD COLUMN IF NOT EXISTS acctivate_uuid text;

CREATE INDEX IF NOT EXISTS dealers_acctivate_uuid_idx
  ON public.dealers (acctivate_uuid)
  WHERE acctivate_uuid IS NOT NULL;

-- Backfill: open_sales_orders.dealer_acctivate_id is an Acctivate customer GUID,
-- while dealers.acctivate_id stores the short customer code. Bridge them via
-- shared order_number / invoice_number in dealer_invoices, which already has
-- a populated dealer_id.
WITH mapping AS (
  SELECT DISTINCT ON (oso.dealer_acctivate_id)
    oso.dealer_acctivate_id AS uuid_key,
    di.dealer_id
  FROM public.open_sales_orders oso
  JOIN public.dealer_invoices di
    ON (di.po_number = oso.order_number OR di.invoice_number = oso.order_number)
  WHERE oso.dealer_acctivate_id IS NOT NULL
    AND di.dealer_id IS NOT NULL
  ORDER BY oso.dealer_acctivate_id, di.invoice_date DESC NULLS LAST
)
UPDATE public.dealers d
SET acctivate_uuid = m.uuid_key
FROM mapping m
WHERE d.id = m.dealer_id
  AND (d.acctivate_uuid IS NULL OR d.acctivate_uuid <> m.uuid_key);