
CREATE TABLE public.dealer_sales (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dealer_id uuid NOT NULL REFERENCES public.dealers(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month text NOT NULL,
  revenue numeric DEFAULT 0,
  order_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(dealer_id, year, month)
);

ALTER TABLE public.dealer_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read dealer_sales" ON public.dealer_sales FOR SELECT TO anon USING (true);
CREATE POLICY "Authenticated users can read dealer_sales" ON public.dealer_sales FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_dealer_sales_updated_at
  BEFORE UPDATE ON public.dealer_sales
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
