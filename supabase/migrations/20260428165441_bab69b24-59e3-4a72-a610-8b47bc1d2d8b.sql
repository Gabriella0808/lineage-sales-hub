CREATE TABLE public.trade_show_markets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  season TEXT,
  year INTEGER,
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.trade_show_markets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all markets"
ON public.trade_show_markets FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Managers read markets"
ON public.trade_show_markets FOR SELECT TO authenticated
USING (public.current_manager_id() IS NOT NULL);

CREATE POLICY "Managers insert markets"
ON public.trade_show_markets FOR INSERT TO authenticated
WITH CHECK (public.current_manager_id() IS NOT NULL OR public.is_admin());

CREATE POLICY "Managers update markets"
ON public.trade_show_markets FOR UPDATE TO authenticated
USING (public.current_manager_id() IS NOT NULL)
WITH CHECK (public.current_manager_id() IS NOT NULL);

CREATE POLICY "Managers delete markets"
ON public.trade_show_markets FOR DELETE TO authenticated
USING (public.current_manager_id() IS NOT NULL);

CREATE TRIGGER trg_trade_show_markets_updated_at
BEFORE UPDATE ON public.trade_show_markets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.trade_show_leads ADD COLUMN market_id UUID REFERENCES public.trade_show_markets(id) ON DELETE SET NULL;
CREATE INDEX idx_trade_show_leads_market ON public.trade_show_leads(market_id);

INSERT INTO public.trade_show_markets (name, location, season, year) VALUES
  ('High Point Spring 2026', 'High Point, NC', 'Spring', 2026),
  ('High Point Fall 2026', 'High Point, NC', 'Fall', 2026),
  ('Atlanta Market Winter 2026', 'Atlanta, GA', 'Winter', 2026),
  ('Las Vegas Market Summer 2026', 'Las Vegas, NV', 'Summer', 2026);