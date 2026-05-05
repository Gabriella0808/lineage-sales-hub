
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS production_stage text,
  ADD COLUMN IF NOT EXISTS prepaid_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_prepaid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS container_type text;

ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS received_date date,
  ADD COLUMN IF NOT EXISTS closeout_initial_qty numeric,
  ADD COLUMN IF NOT EXISTS closeout_units_sold numeric DEFAULT 0;
