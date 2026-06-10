ALTER TABLE public.crm_accounts
  ADD COLUMN IF NOT EXISTS prospect_type text;

CREATE INDEX IF NOT EXISTS idx_crm_accounts_prospect_type ON public.crm_accounts(prospect_type);