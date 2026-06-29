
-- SOP templates
CREATE TABLE public.sop_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  is_builtin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sop_templates TO authenticated;
GRANT ALL ON public.sop_templates TO service_role;
ALTER TABLE public.sop_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own or builtin templates" ON public.sop_templates FOR SELECT TO authenticated
  USING (is_builtin OR created_by = auth.uid());
CREATE POLICY "Create own templates" ON public.sop_templates FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND is_builtin = false);
CREATE POLICY "Update own templates" ON public.sop_templates FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND is_builtin = false);
CREATE POLICY "Delete own templates" ON public.sop_templates FOR DELETE TO authenticated
  USING (created_by = auth.uid() AND is_builtin = false);

CREATE TRIGGER update_sop_templates_updated_at
  BEFORE UPDATE ON public.sop_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- SOP template items
CREATE TABLE public.sop_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.sop_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sop_template_items TO authenticated;
GRANT ALL ON public.sop_template_items TO service_role;
ALTER TABLE public.sop_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View items of visible templates" ON public.sop_template_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sop_templates t WHERE t.id = template_id AND (t.is_builtin OR t.created_by = auth.uid())));
CREATE POLICY "Insert items in own templates" ON public.sop_template_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.sop_templates t WHERE t.id = template_id AND t.created_by = auth.uid() AND t.is_builtin = false));
CREATE POLICY "Update items in own templates" ON public.sop_template_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sop_templates t WHERE t.id = template_id AND t.created_by = auth.uid() AND t.is_builtin = false));
CREATE POLICY "Delete items in own templates" ON public.sop_template_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sop_templates t WHERE t.id = template_id AND t.created_by = auth.uid() AND t.is_builtin = false));

-- manager_tasks: flag SOP items
ALTER TABLE public.manager_tasks ADD COLUMN IF NOT EXISTS is_sop boolean NOT NULL DEFAULT false;

-- Seed built-in template
WITH t AS (
  INSERT INTO public.sop_templates (name, description, is_builtin)
  VALUES ('SOP - Product New Into', 'Standard process for introducing a new product', true)
  RETURNING id
)
INSERT INTO public.sop_template_items (template_id, title, position)
SELECT t.id, item.title, item.pos FROM t, (VALUES
  ('Receive product spec sheet and pricing from vendor', 0),
  ('Assign SKU and create item in Acctivate', 1),
  ('Photograph product (hero + detail shots)', 2),
  ('Write product description and marketing copy', 3),
  ('Set price tiers (MAP, wholesale, MSRP)', 4),
  ('Add product to website / BigCommerce', 5),
  ('Update sales collateral and line sheet', 6),
  ('Notify sales reps and managers of new product', 7),
  ('Add to upcoming trade show samples list', 8),
  ('Confirm first PO placed and ETA logged', 9)
) AS item(title, pos);
