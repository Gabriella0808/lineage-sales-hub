
-- Notes table for the Compare Periods report (per account/collection)
CREATE TABLE IF NOT EXISTS public.compare_periods_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account TEXT NOT NULL,
  collection TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account, collection)
);

ALTER TABLE public.compare_periods_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read compare_periods_notes"
  ON public.compare_periods_notes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated insert compare_periods_notes"
  ON public.compare_periods_notes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated update compare_periods_notes"
  ON public.compare_periods_notes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated delete compare_periods_notes"
  ON public.compare_periods_notes FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_compare_periods_notes_updated_at
  BEFORE UPDATE ON public.compare_periods_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for live updates
ALTER TABLE public.compare_periods_notes REPLICA IDENTITY FULL;
ALTER TABLE public.dealer_sales_lines REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.compare_periods_notes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.dealer_sales_lines;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
