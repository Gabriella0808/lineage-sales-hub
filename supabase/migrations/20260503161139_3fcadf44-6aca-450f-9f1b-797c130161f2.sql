-- Product catalog
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  acctivate_id TEXT UNIQUE,
  sku TEXT NOT NULL UNIQUE,
  name TEXT,
  brand TEXT,
  category TEXT,
  collection TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_brand ON public.products(brand);
CREATE INDEX idx_products_category ON public.products(category);
CREATE INDEX idx_products_collection ON public.products(collection);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read products"
  ON public.products FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-SKU monthly sales fact
CREATE TABLE public.dealer_sales_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dealer_id UUID NOT NULL,
  product_id UUID NOT NULL,
  year INTEGER NOT NULL,
  month TEXT NOT NULL,
  bookings NUMERIC NOT NULL DEFAULT 0,
  invoices NUMERIC NOT NULL DEFAULT 0,
  booking_count INTEGER NOT NULL DEFAULT 0,
  invoice_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dealer_id, product_id, year, month)
);

CREATE INDEX idx_dsl_dealer ON public.dealer_sales_lines(dealer_id);
CREATE INDEX idx_dsl_product ON public.dealer_sales_lines(product_id);
CREATE INDEX idx_dsl_year_month ON public.dealer_sales_lines(year, month);

ALTER TABLE public.dealer_sales_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all dealer_sales_lines"
  ON public.dealer_sales_lines FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "Managers read team dealer_sales_lines"
  ON public.dealer_sales_lines FOR SELECT TO authenticated
  USING (dealer_id IN (
    SELECT d.id FROM public.dealers d
    WHERE d.rep_id IN (SELECT current_manager_rep_ids())
  ));

CREATE POLICY "Reps read own dealer_sales_lines"
  ON public.dealer_sales_lines FOR SELECT TO authenticated
  USING (dealer_id IN (
    SELECT d.id FROM public.dealers d WHERE d.rep_id = current_rep_id()
  ));

CREATE TRIGGER dealer_sales_lines_updated_at
  BEFORE UPDATE ON public.dealer_sales_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();