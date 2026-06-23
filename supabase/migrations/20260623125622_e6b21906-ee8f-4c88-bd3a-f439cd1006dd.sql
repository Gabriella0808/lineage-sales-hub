
CREATE TABLE public.manager_weekly_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  manager_id UUID NOT NULL REFERENCES public.managers(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  responses JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (manager_id, week_start)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manager_weekly_reviews TO authenticated;
GRANT ALL ON public.manager_weekly_reviews TO service_role;

ALTER TABLE public.manager_weekly_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and managers can view weekly reviews"
ON public.manager_weekly_reviews FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins and managers can insert weekly reviews"
ON public.manager_weekly_reviews FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins and managers can update weekly reviews"
ON public.manager_weekly_reviews FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins can delete weekly reviews"
ON public.manager_weekly_reviews FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_manager_weekly_reviews_updated_at
BEFORE UPDATE ON public.manager_weekly_reviews
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_manager_weekly_reviews_manager_week ON public.manager_weekly_reviews(manager_id, week_start DESC);
