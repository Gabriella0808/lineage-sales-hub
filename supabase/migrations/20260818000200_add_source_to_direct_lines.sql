-- Tag each row with its sync origin so Jan–Jul rows (Skyvia/previous pull)
-- can be distinguished from Aug+ rows (VM direct pull).
ALTER TABLE public.acctivate_invoice_lines_2026_direct
  ADD COLUMN IF NOT EXISTS source text;
