ALTER TABLE public.crm_accounts ADD COLUMN IF NOT EXISTS rep_owner text;
ALTER TABLE public.crm_accounts ADD COLUMN IF NOT EXISTS buying_group text;