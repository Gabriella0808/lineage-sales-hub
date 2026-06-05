ALTER TABLE public.dealers DROP COLUMN IF EXISTS acctivate_uuid;
DROP INDEX IF EXISTS public.dealers_acctivate_uuid_idx;

CREATE TABLE IF NOT EXISTS public.dealer_acctivate_uuids (
  acctivate_uuid text PRIMARY KEY,
  dealer_id uuid NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dealer_acctivate_uuids_dealer_id_idx
  ON public.dealer_acctivate_uuids (dealer_id);

GRANT SELECT ON public.dealer_acctivate_uuids TO authenticated;
GRANT ALL ON public.dealer_acctivate_uuids TO service_role;

ALTER TABLE public.dealer_acctivate_uuids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read dealer_acctivate_uuids"
  ON public.dealer_acctivate_uuids FOR SELECT
  TO authenticated
  USING (is_staff_user());

-- Backfill from invoices that share order numbers with open sales orders.
INSERT INTO public.dealer_acctivate_uuids (acctivate_uuid, dealer_id)
SELECT DISTINCT ON (oso.dealer_acctivate_id)
  oso.dealer_acctivate_id, di.dealer_id
FROM public.open_sales_orders oso
JOIN public.dealer_invoices di
  ON (di.po_number = oso.order_number OR di.invoice_number = oso.order_number)
WHERE oso.dealer_acctivate_id IS NOT NULL
  AND di.dealer_id IS NOT NULL
ORDER BY oso.dealer_acctivate_id, di.invoice_date DESC NULLS LAST
ON CONFLICT (acctivate_uuid) DO NOTHING;