
-- Add dealer role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dealer';

-- user_dealers mapping
CREATE TABLE IF NOT EXISTS public.user_dealers (
  user_id uuid PRIMARY KEY,
  dealer_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_dealers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own dealer link" ON public.user_dealers
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "Admins manage user_dealers" ON public.user_dealers
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE OR REPLACE FUNCTION public.current_dealer_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT dealer_id FROM public.user_dealers WHERE user_id = auth.uid() $$;

-- Extend products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS bc_product_id text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS base_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS stock_status text,
  ADD COLUMN IF NOT EXISTS inventory_level numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS products_bc_product_id_key ON public.products(bc_product_id) WHERE bc_product_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_key ON public.products(sku);

-- product_price_tiers
CREATE TABLE IF NOT EXISTS public.product_price_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  customer_group_label text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, customer_group_label)
);
ALTER TABLE public.product_price_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read price tiers" ON public.product_price_tiers
  FOR SELECT TO authenticated USING (true);

-- quotes
CREATE TABLE IF NOT EXISTS public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  dealer_id uuid,
  status text NOT NULL DEFAULT 'draft',
  submitted_at timestamptz,
  notes text,
  total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own quotes" ON public.quotes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin() OR current_manager_id() IS NOT NULL OR (dealer_id IS NOT NULL AND dealer_id = current_dealer_id()));
CREATE POLICY "Users insert own quotes" ON public.quotes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own draft quotes" ON public.quotes FOR UPDATE TO authenticated
  USING ((user_id = auth.uid() AND status = 'draft') OR is_admin())
  WITH CHECK ((user_id = auth.uid()) OR is_admin());
CREATE POLICY "Users delete own draft quotes" ON public.quotes FOR DELETE TO authenticated
  USING ((user_id = auth.uid() AND status = 'draft') OR is_admin());

-- quote_items
CREATE TABLE IF NOT EXISTS public.quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  sku text NOT NULL,
  name text NOT NULL,
  qty numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View items of viewable quotes" ON public.quote_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id
    AND (q.user_id = auth.uid() OR is_admin() OR current_manager_id() IS NOT NULL
         OR (q.dealer_id IS NOT NULL AND q.dealer_id = current_dealer_id()))));
CREATE POLICY "Modify items of own draft quotes" ON public.quote_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND q.user_id = auth.uid() AND q.status = 'draft'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND q.user_id = auth.uid() AND q.status = 'draft'));

CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_price_tiers_updated_at BEFORE UPDATE ON public.product_price_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
