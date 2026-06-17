ALTER TABLE public.trade_show_leads
  ADD COLUMN IF NOT EXISTS prospect_types text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS crm_account_id uuid REFERENCES public.crm_accounts(id) ON DELETE SET NULL;