
-- Drop overly-permissive SELECT policies
DROP POLICY IF EXISTS "Authenticated users can read contacts" ON public.contacts;
DROP POLICY IF EXISTS "Authenticated read dealer_demand_signals" ON public.dealer_demand_signals;
DROP POLICY IF EXISTS "Authenticated users can read inventory" ON public.inventory;
DROP POLICY IF EXISTS "Authenticated read lost_sales_events" ON public.lost_sales_events;
DROP POLICY IF EXISTS "Authenticated read open_sales_orders" ON public.open_sales_orders;
DROP POLICY IF EXISTS "Authenticated read purchase_order_lines" ON public.purchase_order_lines;
DROP POLICY IF EXISTS "Authenticated read purchase_orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "Authenticated read sku_sales_history" ON public.sku_sales_history;

-- Helper: is the current user a non-dealer staff member (admin/manager/rep)
CREATE OR REPLACE FUNCTION public.is_staff_user()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.has_role(auth.uid(), 'rep')
      OR public.current_manager_id() IS NOT NULL
      OR public.current_rep_id() IS NOT NULL
$$;

-- Staff-only read access (admin, manager, rep)
CREATE POLICY "Staff can read contacts" ON public.contacts
  FOR SELECT TO authenticated USING (public.is_staff_user());

CREATE POLICY "Staff can read dealer_demand_signals" ON public.dealer_demand_signals
  FOR SELECT TO authenticated USING (public.is_staff_user());

CREATE POLICY "Staff can read inventory" ON public.inventory
  FOR SELECT TO authenticated USING (public.is_staff_user());

CREATE POLICY "Staff can read lost_sales_events" ON public.lost_sales_events
  FOR SELECT TO authenticated USING (public.is_staff_user());

CREATE POLICY "Staff can read purchase_orders" ON public.purchase_orders
  FOR SELECT TO authenticated USING (public.is_staff_user());

CREATE POLICY "Staff can read purchase_order_lines" ON public.purchase_order_lines
  FOR SELECT TO authenticated USING (public.is_staff_user());

CREATE POLICY "Staff can read sku_sales_history" ON public.sku_sales_history
  FOR SELECT TO authenticated USING (public.is_staff_user());

-- Open sales orders: dealer-scoped
CREATE POLICY "Admins read all open_sales_orders" ON public.open_sales_orders
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers read team open_sales_orders" ON public.open_sales_orders
  FOR SELECT TO authenticated
  USING (
    public.current_manager_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.dealers d
      WHERE d.id = open_sales_orders.dealer_id
        AND d.manager_id = public.current_manager_id()
    )
  );

CREATE POLICY "Reps read their dealers open_sales_orders" ON public.open_sales_orders
  FOR SELECT TO authenticated
  USING (
    public.current_rep_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.dealers d
      WHERE d.id = open_sales_orders.dealer_id
        AND d.rep_id = public.current_rep_id()
    )
  );

CREATE POLICY "Dealers read own open_sales_orders" ON public.open_sales_orders
  FOR SELECT TO authenticated
  USING (
    public.current_dealer_id() IS NOT NULL
    AND open_sales_orders.dealer_id = public.current_dealer_id()
  );
