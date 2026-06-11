
CREATE TABLE public.acctivate_sales_reps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acctivate_id TEXT NOT NULL UNIQUE,
  rep_code TEXT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  manager_acctivate_id TEXT,
  manager_name TEXT,
  territory_acctivate_id TEXT,
  territory_name TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.acctivate_sales_reps TO authenticated;
GRANT ALL ON public.acctivate_sales_reps TO service_role;
ALTER TABLE public.acctivate_sales_reps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view acctivate sales reps" ON public.acctivate_sales_reps
  FOR SELECT TO authenticated USING (public.is_staff_user());

CREATE TABLE public.acctivate_sales_managers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acctivate_id TEXT NOT NULL UNIQUE,
  manager_code TEXT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  job_title TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.acctivate_sales_managers TO authenticated;
GRANT ALL ON public.acctivate_sales_managers TO service_role;
ALTER TABLE public.acctivate_sales_managers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view acctivate sales managers" ON public.acctivate_sales_managers
  FOR SELECT TO authenticated USING (public.is_staff_user());

CREATE TABLE public.acctivate_territories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acctivate_id TEXT NOT NULL UNIQUE,
  territory_code TEXT,
  name TEXT NOT NULL,
  description TEXT,
  manager_acctivate_id TEXT,
  manager_name TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.acctivate_territories TO authenticated;
GRANT ALL ON public.acctivate_territories TO service_role;
ALTER TABLE public.acctivate_territories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view acctivate territories" ON public.acctivate_territories
  FOR SELECT TO authenticated USING (public.is_staff_user());

CREATE TRIGGER trg_acctivate_sales_reps_updated_at BEFORE UPDATE ON public.acctivate_sales_reps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_acctivate_sales_managers_updated_at BEFORE UPDATE ON public.acctivate_sales_managers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_acctivate_territories_updated_at BEFORE UPDATE ON public.acctivate_territories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
