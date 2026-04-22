
-- =========================================================================
-- 1. Roles enum + user_roles table
-- =========================================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'rep');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 2. has_role security-definer function (prevents RLS recursion)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

-- =========================================================================
-- 3. Link tables: user -> manager, user -> rep
-- =========================================================================
CREATE TABLE public.user_managers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  manager_id uuid NOT NULL REFERENCES public.managers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_reps (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  rep_id uuid NOT NULL REFERENCES public.sales_reps(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reps ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 4. Add email column to sales_reps for future auth linking
-- =========================================================================
-- (sales_reps already has 'email' column per schema, no-op for safety)

-- =========================================================================
-- 5. Helper: get current user's manager_id / rep_id
-- =========================================================================
CREATE OR REPLACE FUNCTION public.current_manager_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT manager_id FROM public.user_managers WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_rep_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT rep_id FROM public.user_reps WHERE user_id = auth.uid()
$$;

-- Reps belonging to the currently logged-in manager
CREATE OR REPLACE FUNCTION public.current_manager_rep_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT r.id FROM public.sales_reps r
  WHERE r.manager_id = public.current_manager_id()
$$;

-- =========================================================================
-- 6. Seed admin role for Gabriella, Justin, Scott (by email)
-- =========================================================================
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM auth.users u
WHERE lower(u.email) IN (
  'gabriella@lineage-collections.com',
  'justin@lineage-collections.com',
  'scott@lineage-collections.com'
)
ON CONFLICT (user_id, role) DO NOTHING;

-- Auto-link existing seeded users to their manager record by email
INSERT INTO public.user_managers (user_id, manager_id)
SELECT u.id, m.id
FROM auth.users u
JOIN public.managers m ON lower(m.email) = lower(u.email)
ON CONFLICT (user_id) DO NOTHING;

-- =========================================================================
-- 7. RLS POLICIES
-- =========================================================================

-- ── user_roles: admin manages, users see own ──
CREATE POLICY "Admins manage roles"
  ON public.user_roles FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Users view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- ── user_managers ──
CREATE POLICY "Admins manage user_managers"
  ON public.user_managers FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Users view own user_managers"
  ON public.user_managers FOR SELECT
  USING (auth.uid() = user_id);

-- ── user_reps ──
CREATE POLICY "Admins manage user_reps"
  ON public.user_reps FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Users view own user_reps"
  ON public.user_reps FOR SELECT
  USING (auth.uid() = user_id);

-- =========================================================================
-- 8. Replace permissive RLS with role-scoped policies on data tables
-- =========================================================================

-- ── managers ──
DROP POLICY IF EXISTS "Allow anon read managers" ON public.managers;
DROP POLICY IF EXISTS "Authenticated users can read managers" ON public.managers;

CREATE POLICY "Admins read all managers"
  ON public.managers FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Managers read own record"
  ON public.managers FOR SELECT TO authenticated
  USING (id = public.current_manager_id());

-- Reps need to know who their manager is
CREATE POLICY "Reps read their manager"
  ON public.managers FOR SELECT TO authenticated
  USING (
    id = (SELECT manager_id FROM public.sales_reps WHERE id = public.current_rep_id())
  );

-- ── sales_reps ──
DROP POLICY IF EXISTS "Allow anon read sales_reps" ON public.sales_reps;
DROP POLICY IF EXISTS "Authenticated users can read sales_reps" ON public.sales_reps;

CREATE POLICY "Admins read all reps"
  ON public.sales_reps FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Managers read their reps"
  ON public.sales_reps FOR SELECT TO authenticated
  USING (manager_id = public.current_manager_id());

CREATE POLICY "Reps read own record"
  ON public.sales_reps FOR SELECT TO authenticated
  USING (id = public.current_rep_id());

-- ── territories ──
DROP POLICY IF EXISTS "Allow anon read territories" ON public.territories;
DROP POLICY IF EXISTS "Authenticated users can read territories" ON public.territories;

CREATE POLICY "Admins read all territories"
  ON public.territories FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Managers read team territories"
  ON public.territories FOR SELECT TO authenticated
  USING (
    public.current_manager_id() IS NOT NULL
    AND id IN (
      SELECT rt.territory_id FROM public.rep_territories rt
      WHERE rt.rep_id IN (SELECT public.current_manager_rep_ids())
    )
  );

CREATE POLICY "Reps read own territories"
  ON public.territories FOR SELECT TO authenticated
  USING (
    public.current_rep_id() IS NOT NULL
    AND id IN (
      SELECT rt.territory_id FROM public.rep_territories rt
      WHERE rt.rep_id = public.current_rep_id()
    )
  );

-- ── rep_territories ──
DROP POLICY IF EXISTS "Allow anon read rep_territories" ON public.rep_territories;
DROP POLICY IF EXISTS "Authenticated users can read rep_territories" ON public.rep_territories;

CREATE POLICY "Admins read all rep_territories"
  ON public.rep_territories FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Managers read team rep_territories"
  ON public.rep_territories FOR SELECT TO authenticated
  USING (rep_id IN (SELECT public.current_manager_rep_ids()));

CREATE POLICY "Reps read own rep_territories"
  ON public.rep_territories FOR SELECT TO authenticated
  USING (rep_id = public.current_rep_id());

-- ── dealers ──
DROP POLICY IF EXISTS "Allow anon read dealers" ON public.dealers;
DROP POLICY IF EXISTS "Authenticated users can read dealers" ON public.dealers;

CREATE POLICY "Admins read all dealers"
  ON public.dealers FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Managers read team dealers"
  ON public.dealers FOR SELECT TO authenticated
  USING (rep_id IN (SELECT public.current_manager_rep_ids()));

CREATE POLICY "Reps read own dealers"
  ON public.dealers FOR SELECT TO authenticated
  USING (rep_id = public.current_rep_id());

-- ── dealer_sales (scoped via dealer ownership) ──
DROP POLICY IF EXISTS "Allow anon read dealer_sales" ON public.dealer_sales;
DROP POLICY IF EXISTS "Authenticated users can read dealer_sales" ON public.dealer_sales;

CREATE POLICY "Admins read all dealer_sales"
  ON public.dealer_sales FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Managers read team dealer_sales"
  ON public.dealer_sales FOR SELECT TO authenticated
  USING (
    dealer_id IN (
      SELECT id FROM public.dealers
      WHERE rep_id IN (SELECT public.current_manager_rep_ids())
    )
  );

CREATE POLICY "Reps read own dealer_sales"
  ON public.dealer_sales FOR SELECT TO authenticated
  USING (
    dealer_id IN (
      SELECT id FROM public.dealers WHERE rep_id = public.current_rep_id()
    )
  );

-- ── kpi_records ──
CREATE POLICY "Admins read all kpi_records"
  ON public.kpi_records FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Managers read team kpi_records"
  ON public.kpi_records FOR SELECT TO authenticated
  USING (rep_id IN (SELECT public.current_manager_rep_ids()));

CREATE POLICY "Reps read own kpi_records"
  ON public.kpi_records FOR SELECT TO authenticated
  USING (rep_id = public.current_rep_id());

-- ── tasks (legacy table — scope by rep_id) ──
DROP POLICY IF EXISTS "Allow anon read tasks" ON public.tasks;
DROP POLICY IF EXISTS "Authenticated users can read tasks" ON public.tasks;

CREATE POLICY "Admins read all tasks"
  ON public.tasks FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Managers read team tasks"
  ON public.tasks FOR SELECT TO authenticated
  USING (rep_id IN (SELECT public.current_manager_rep_ids()));

CREATE POLICY "Reps read own tasks"
  ON public.tasks FOR SELECT TO authenticated
  USING (rep_id = public.current_rep_id());

-- ── travel_log ──
DROP POLICY IF EXISTS "Allow anon read travel_log" ON public.travel_log;
DROP POLICY IF EXISTS "Authenticated users can read travel_log" ON public.travel_log;

CREATE POLICY "Admins read all travel_log"
  ON public.travel_log FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Managers read team travel_log"
  ON public.travel_log FOR SELECT TO authenticated
  USING (
    manager_id = public.current_manager_id()
    OR rep_id IN (SELECT public.current_manager_rep_ids())
  );

CREATE POLICY "Reps read own travel_log"
  ON public.travel_log FOR SELECT TO authenticated
  USING (rep_id = public.current_rep_id());

-- ── activities ──
DROP POLICY IF EXISTS "Allow anon read activities" ON public.activities;
DROP POLICY IF EXISTS "Authenticated users can read activities" ON public.activities;

CREATE POLICY "Admins read all activities"
  ON public.activities FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Managers read own activities"
  ON public.activities FOR SELECT TO authenticated
  USING (manager_id = public.current_manager_id());

-- ── contacts (directory) — admins + managers + reps still read; tighten later if needed ──
DROP POLICY IF EXISTS "Allow anon read contacts" ON public.contacts;
-- keep existing "Authenticated users can read contacts" for now

-- ── sign_in_log: admin only ──
DROP POLICY IF EXISTS "Authenticated can read sign-in log" ON public.sign_in_log;
CREATE POLICY "Admins read sign-in log"
  ON public.sign_in_log FOR SELECT TO authenticated
  USING (public.is_admin());
