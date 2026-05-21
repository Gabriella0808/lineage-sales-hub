
-- Per-customer invoice headers synced from Acctivate
CREATE TABLE public.dealer_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  acctivate_id TEXT NOT NULL UNIQUE,
  dealer_id UUID REFERENCES public.dealers(id) ON DELETE SET NULL,
  dealer_acctivate_id TEXT,
  invoice_number TEXT,
  invoice_date DATE,
  due_date DATE,
  subtotal NUMERIC DEFAULT 0,
  tax NUMERIC DEFAULT 0,
  freight NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  balance NUMERIC DEFAULT 0,
  status TEXT,
  terms TEXT,
  salesperson TEXT,
  po_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dealer_invoices_dealer_id ON public.dealer_invoices(dealer_id);
CREATE INDEX idx_dealer_invoices_dealer_acctivate_id ON public.dealer_invoices(dealer_acctivate_id);
CREATE INDEX idx_dealer_invoices_invoice_date ON public.dealer_invoices(invoice_date);

ALTER TABLE public.dealer_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all dealer_invoices" ON public.dealer_invoices
  FOR SELECT TO authenticated USING (is_admin());

CREATE POLICY "Managers read all dealer_invoices" ON public.dealer_invoices
  FOR SELECT TO authenticated USING (current_manager_id() IS NOT NULL);

CREATE POLICY "Reps read own dealer_invoices" ON public.dealer_invoices
  FOR SELECT TO authenticated USING (
    dealer_id IN (SELECT id FROM public.dealers WHERE rep_id = current_rep_id())
  );

CREATE TRIGGER update_dealer_invoices_updated_at
  BEFORE UPDATE ON public.dealer_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-resolve dealer_id from dealer_acctivate_id on insert/update
CREATE OR REPLACE FUNCTION public.resolve_dealer_invoice_dealer_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.dealer_id IS NULL AND NEW.dealer_acctivate_id IS NOT NULL THEN
    SELECT id INTO NEW.dealer_id
    FROM public.dealers
    WHERE acctivate_id = NEW.dealer_acctivate_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER resolve_dealer_invoice_dealer_id_trigger
  BEFORE INSERT OR UPDATE ON public.dealer_invoices
  FOR EACH ROW EXECUTE FUNCTION public.resolve_dealer_invoice_dealer_id();
