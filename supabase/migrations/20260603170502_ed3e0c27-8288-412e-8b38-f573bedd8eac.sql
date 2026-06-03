ALTER TABLE public.open_sales_orders ADD COLUMN IF NOT EXISTS dealer_acctivate_id text;
CREATE UNIQUE INDEX IF NOT EXISTS open_sales_orders_acctivate_id_key ON public.open_sales_orders(acctivate_id) WHERE acctivate_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_open_sales_orders_dealer_acctivate_id ON public.open_sales_orders(dealer_acctivate_id);