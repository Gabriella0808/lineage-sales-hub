
-- Invoice line items synced from Acctivate (e.g. dbo.InvoiceDetail)
CREATE TABLE public.dealer_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acctivate_id text NOT NULL UNIQUE,
  invoice_acctivate_id text,
  invoice_id uuid,
  dealer_acctivate_id text,
  dealer_id uuid,
  product_id uuid,
  sku text,
  product_name text,
  invoice_date date,
  qty numeric DEFAULT 0,
  unit_price numeric DEFAULT 0,
  extended_price numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dil_invoice_acct ON public.dealer_invoice_lines(invoice_acctivate_id);
CREATE INDEX idx_dil_dealer_id ON public.dealer_invoice_lines(dealer_id);
CREATE INDEX idx_dil_product_id ON public.dealer_invoice_lines(product_id);
CREATE INDEX idx_dil_sku ON public.dealer_invoice_lines(sku);
CREATE INDEX idx_dil_invoice_date ON public.dealer_invoice_lines(invoice_date);

ALTER TABLE public.dealer_invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all dealer_invoice_lines"
  ON public.dealer_invoice_lines FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "Managers read all dealer_invoice_lines"
  ON public.dealer_invoice_lines FOR SELECT TO authenticated
  USING (current_manager_id() IS NOT NULL);

CREATE POLICY "Reps read own dealer_invoice_lines"
  ON public.dealer_invoice_lines FOR SELECT TO authenticated
  USING (dealer_id IN (SELECT id FROM dealers WHERE rep_id = current_rep_id()));

-- Auto-resolve dealer_id, invoice_id, product_id on insert/update
CREATE OR REPLACE FUNCTION public.resolve_dealer_invoice_line_links()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.dealer_id IS NULL AND NEW.dealer_acctivate_id IS NOT NULL THEN
    SELECT id INTO NEW.dealer_id FROM public.dealers
     WHERE acctivate_id = NEW.dealer_acctivate_id LIMIT 1;
  END IF;
  IF NEW.invoice_id IS NULL AND NEW.invoice_acctivate_id IS NOT NULL THEN
    SELECT id INTO NEW.invoice_id FROM public.dealer_invoices
     WHERE acctivate_id = NEW.invoice_acctivate_id LIMIT 1;
  END IF;
  IF NEW.product_id IS NULL AND NEW.sku IS NOT NULL THEN
    SELECT id INTO NEW.product_id FROM public.products
     WHERE sku = NEW.sku LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_resolve_dealer_invoice_line_links
  BEFORE INSERT OR UPDATE ON public.dealer_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.resolve_dealer_invoice_line_links();

CREATE TRIGGER trg_dealer_invoice_lines_updated_at
  BEFORE UPDATE ON public.dealer_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
