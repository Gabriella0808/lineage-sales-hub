-- Add line_number and natural_key to acctivate_invoice_lines_2026_direct.
--
-- line_number : dtl.LineNumber from Acctivate — identifies each line within an invoice.
-- natural_key : invoice_number || '-' || line_number || '-' || product_id || '-' || order_number
--               Used as the upsert conflict key when GUIDInvoiceDetail values are
--               duplicated or blank (confirmed bug on Aug 4-5 2026 invoices).
--
-- The unique index permits NULL natural_key so existing Jan-Jul rows are unaffected
-- (PostgreSQL treats each NULL as distinct, allowing multiple NULL rows).

ALTER TABLE public.acctivate_invoice_lines_2026_direct
  ADD COLUMN IF NOT EXISTS line_number  text,
  ADD COLUMN IF NOT EXISTS natural_key  text;

-- PostgREST requires a unique index for on_conflict=natural_key upsert.
CREATE UNIQUE INDEX IF NOT EXISTS idx_direct_natural_key
  ON public.acctivate_invoice_lines_2026_direct (natural_key);
