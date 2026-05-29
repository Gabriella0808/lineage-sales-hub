
-- QuickBooks customers
CREATE TABLE public.qb_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  company_name TEXT,
  email TEXT,
  phone TEXT,
  bill_address TEXT,
  ship_address TEXT,
  balance NUMERIC(14,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.qb_customers TO authenticated;
GRANT ALL ON public.qb_customers TO service_role;
ALTER TABLE public.qb_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and managers can view QB customers"
  ON public.qb_customers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- QuickBooks invoices
CREATE TABLE public.qb_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_id TEXT NOT NULL UNIQUE,
  ref_number TEXT,
  customer_list_id TEXT REFERENCES public.qb_customers(list_id) ON DELETE SET NULL,
  customer_name TEXT,
  txn_date DATE,
  due_date DATE,
  subtotal NUMERIC(14,2) DEFAULT 0,
  tax NUMERIC(14,2) DEFAULT 0,
  total NUMERIC(14,2) DEFAULT 0,
  balance_remaining NUMERIC(14,2) DEFAULT 0,
  memo TEXT,
  is_paid BOOLEAN DEFAULT FALSE,
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_qb_invoices_customer ON public.qb_invoices(customer_list_id);
CREATE INDEX idx_qb_invoices_date ON public.qb_invoices(txn_date DESC);
GRANT SELECT ON public.qb_invoices TO authenticated;
GRANT ALL ON public.qb_invoices TO service_role;
ALTER TABLE public.qb_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and managers can view QB invoices"
  ON public.qb_invoices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- QuickBooks invoice lines
CREATE TABLE public.qb_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_txn_id TEXT NOT NULL REFERENCES public.qb_invoices(txn_id) ON DELETE CASCADE,
  line_number INT,
  item_name TEXT,
  description TEXT,
  quantity NUMERIC(14,4),
  rate NUMERIC(14,4),
  amount NUMERIC(14,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_qb_invoice_lines_invoice ON public.qb_invoice_lines(invoice_txn_id);
GRANT SELECT ON public.qb_invoice_lines TO authenticated;
GRANT ALL ON public.qb_invoice_lines TO service_role;
ALTER TABLE public.qb_invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and managers can view QB invoice lines"
  ON public.qb_invoice_lines FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Sync run log
CREATE TABLE public.qbwc_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket TEXT,
  action TEXT,
  status TEXT,
  message TEXT,
  rows_processed INT DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX idx_qbwc_sync_log_started ON public.qbwc_sync_log(started_at DESC);
GRANT SELECT ON public.qbwc_sync_log TO authenticated;
GRANT ALL ON public.qbwc_sync_log TO service_role;
ALTER TABLE public.qbwc_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and managers can view QB sync log"
  ON public.qbwc_sync_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- updated_at triggers
CREATE TRIGGER update_qb_customers_updated_at BEFORE UPDATE ON public.qb_customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_qb_invoices_updated_at BEFORE UPDATE ON public.qb_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
