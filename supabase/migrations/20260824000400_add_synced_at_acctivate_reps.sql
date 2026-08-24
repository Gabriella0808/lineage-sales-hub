-- Add synced_at to Acctivate rep/manager/territory tables so the sync script
-- can stamp each row with the time it was last pushed from Acctivate.

ALTER TABLE public.acctivate_sales_reps
  ADD COLUMN IF NOT EXISTS synced_at timestamptz;

ALTER TABLE public.acctivate_sales_managers
  ADD COLUMN IF NOT EXISTS synced_at timestamptz;

ALTER TABLE public.acctivate_territories
  ADD COLUMN IF NOT EXISTS synced_at timestamptz;
