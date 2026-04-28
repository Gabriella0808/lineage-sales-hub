CREATE TABLE public.product_collections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.product_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view collections"
ON public.product_collections FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert collections"
ON public.product_collections FOR INSERT
TO authenticated WITH CHECK (true);

CREATE POLICY "Admins can delete collections"
ON public.product_collections FOR DELETE
TO authenticated USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.product_collections (name) VALUES
  ('Cabinet Beds'),('Cape May'),('Capri'),('Chatham'),('Credenzas'),
  ('Geneva'),('Harbor View'),('Islamorada'),('Island Breeze'),
  ('Manhattan Valley'),('Miramar'),('Mixed Container'),('Monaco'),
  ('Montauk'),('New Credenza'),('Ocean Isles'),('Other Product'),
  ('Picket Fence'),('Point Breeze'),('Rio Vista'),('Surfside'),
  ('Sun Haven'),('Lamps')
ON CONFLICT (name) DO NOTHING;