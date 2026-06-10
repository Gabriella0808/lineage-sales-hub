CREATE TABLE IF NOT EXISTS public.crm_prospect_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.crm_prospect_types TO authenticated;
GRANT ALL ON public.crm_prospect_types TO service_role;

ALTER TABLE public.crm_prospect_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read prospect types" ON public.crm_prospect_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert prospect types" ON public.crm_prospect_types
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins delete prospect types" ON public.crm_prospect_types
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.crm_prospect_types (name) VALUES
  ('Night & Day'),
  ('Top 100 Furniture Stores')
ON CONFLICT (name) DO NOTHING;

-- Migrate any existing legacy slug values on accounts
UPDATE public.crm_accounts SET prospect_type = 'Night & Day' WHERE prospect_type = 'night_and_day';
UPDATE public.crm_accounts SET prospect_type = 'Top 100 Furniture Stores' WHERE prospect_type = 'top_100';