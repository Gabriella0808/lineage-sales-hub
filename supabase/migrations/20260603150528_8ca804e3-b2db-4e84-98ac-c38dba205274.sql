ALTER TABLE public.open_sales_orders
  ADD COLUMN IF NOT EXISTS stock_class text,
  ADD COLUMN IF NOT EXISTS stock_class_description text,
  ADD COLUMN IF NOT EXISTS rep text;

CREATE INDEX IF NOT EXISTS idx_open_sales_orders_stock_class ON public.open_sales_orders(stock_class);