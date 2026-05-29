ALTER TABLE public.crm_accounts ADD COLUMN IF NOT EXISTS brand text NOT NULL DEFAULT 'Cabinet Beds';
CREATE INDEX IF NOT EXISTS idx_crm_accounts_brand ON public.crm_accounts(brand);