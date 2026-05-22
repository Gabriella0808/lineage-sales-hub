ALTER TABLE public.dealer_invoices ADD COLUMN IF NOT EXISTS branch text;
CREATE INDEX IF NOT EXISTS dealer_invoices_branch_idx ON public.dealer_invoices (branch);