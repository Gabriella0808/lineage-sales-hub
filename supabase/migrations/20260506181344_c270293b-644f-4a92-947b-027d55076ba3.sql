
-- Org chart positions
CREATE TABLE public.org_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  holder_name text,
  department text,
  parent_id uuid REFERENCES public.org_positions(id) ON DELETE SET NULL,
  job_description text,
  main_objectives text,
  position_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX idx_org_positions_parent ON public.org_positions(parent_id);

ALTER TABLE public.org_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read positions"
  ON public.org_positions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins insert positions"
  ON public.org_positions FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Admins update positions"
  ON public.org_positions FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins delete positions"
  ON public.org_positions FOR DELETE
  TO authenticated USING (public.is_admin());

CREATE TRIGGER update_org_positions_updated_at
  BEFORE UPDATE ON public.org_positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Yearly reviews per position
CREATE TABLE public.org_position_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES public.org_positions(id) ON DELETE CASCADE,
  review_year integer NOT NULL,
  reviewer_name text,
  rating integer CHECK (rating >= 1 AND rating <= 5),
  strengths text,
  areas_for_improvement text,
  goals_next_year text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX idx_org_reviews_position ON public.org_position_reviews(position_id);

ALTER TABLE public.org_position_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read reviews"
  ON public.org_position_reviews FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins insert reviews"
  ON public.org_position_reviews FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Admins update reviews"
  ON public.org_position_reviews FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins delete reviews"
  ON public.org_position_reviews FOR DELETE
  TO authenticated USING (public.is_admin());

CREATE TRIGGER update_org_reviews_updated_at
  BEFORE UPDATE ON public.org_position_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
