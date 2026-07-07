-- Speed up the Prospects page query which orders by updated_at DESC, id ASC.
-- Without this index, every load does a full sequential scan + sort.
CREATE INDEX IF NOT EXISTS idx_crm_accounts_updated_at
  ON public.crm_accounts (updated_at DESC, id ASC);
