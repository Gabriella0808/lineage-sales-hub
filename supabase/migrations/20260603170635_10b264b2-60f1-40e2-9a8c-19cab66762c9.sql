DROP INDEX IF EXISTS public.open_sales_orders_acctivate_id_key;
ALTER TABLE public.open_sales_orders ADD CONSTRAINT open_sales_orders_acctivate_id_key UNIQUE (acctivate_id);