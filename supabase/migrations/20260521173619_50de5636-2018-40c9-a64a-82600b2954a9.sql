ALTER TABLE public.dealers ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'acctivate';
CREATE INDEX IF NOT EXISTS idx_dealers_source ON public.dealers(source);