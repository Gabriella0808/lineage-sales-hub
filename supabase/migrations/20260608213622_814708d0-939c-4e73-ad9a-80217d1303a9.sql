
-- Restrict product_collections insert to staff only
DROP POLICY IF EXISTS "Authenticated users can insert collections" ON public.product_collections;
CREATE POLICY "Staff insert collections" ON public.product_collections
  FOR INSERT TO authenticated WITH CHECK (public.is_staff_user());

-- Restrict monday_boards read to staff
DROP POLICY IF EXISTS "Authenticated read monday_boards" ON public.monday_boards;
CREATE POLICY "Staff read monday_boards" ON public.monday_boards
  FOR SELECT TO authenticated USING (public.is_staff_user());

-- Restrict org_positions read to staff
DROP POLICY IF EXISTS "Authenticated read positions" ON public.org_positions;
CREATE POLICY "Staff read positions" ON public.org_positions
  FOR SELECT TO authenticated USING (public.is_staff_user());

-- Restrict product_price_tiers read to staff
DROP POLICY IF EXISTS "Authenticated read price tiers" ON public.product_price_tiers;
CREATE POLICY "Staff read price tiers" ON public.product_price_tiers
  FOR SELECT TO authenticated USING (public.is_staff_user());
