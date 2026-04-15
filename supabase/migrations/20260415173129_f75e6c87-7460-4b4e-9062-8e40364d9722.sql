
-- Timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Managers
CREATE TABLE public.managers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  acctivate_id TEXT UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  region TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.managers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read managers" ON public.managers FOR SELECT TO authenticated USING (true);
CREATE TRIGGER update_managers_updated_at BEFORE UPDATE ON public.managers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Sales Reps
CREATE TABLE public.sales_reps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  acctivate_id TEXT UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  manager_id UUID REFERENCES public.managers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'on-leave')),
  kpi_score INTEGER DEFAULT 0,
  quota NUMERIC(12,2) DEFAULT 0,
  revenue NUMERIC(12,2) DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  tasks_pending INTEGER DEFAULT 0,
  tasks_overdue INTEGER DEFAULT 0,
  last_activity DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sales_reps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read sales_reps" ON public.sales_reps FOR SELECT TO authenticated USING (true);
CREATE TRIGGER update_sales_reps_updated_at BEFORE UPDATE ON public.sales_reps FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Territories
CREATE TABLE public.territories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  acctivate_id TEXT UNIQUE,
  name TEXT NOT NULL,
  region TEXT,
  state TEXT,
  revenue NUMERIC(12,2) DEFAULT 0,
  quota NUMERIC(12,2) DEFAULT 0,
  kpi_score INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'on-track' CHECK (status IN ('on-track', 'at-risk', 'underperforming', 'exceeding')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.territories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read territories" ON public.territories FOR SELECT TO authenticated USING (true);
CREATE TRIGGER update_territories_updated_at BEFORE UPDATE ON public.territories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Rep-Territory join
CREATE TABLE public.rep_territories (
  rep_id UUID NOT NULL REFERENCES public.sales_reps(id) ON DELETE CASCADE,
  territory_id UUID NOT NULL REFERENCES public.territories(id) ON DELETE CASCADE,
  PRIMARY KEY (rep_id, territory_id)
);
ALTER TABLE public.rep_territories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read rep_territories" ON public.rep_territories FOR SELECT TO authenticated USING (true);

-- Dealers
CREATE TABLE public.dealers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  acctivate_id TEXT UNIQUE,
  name TEXT NOT NULL,
  rep_id UUID REFERENCES public.sales_reps(id) ON DELETE SET NULL,
  territory_id UUID REFERENCES public.territories(id) ON DELETE SET NULL,
  city TEXT,
  state TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'prospect', 'at-risk')),
  engagement TEXT DEFAULT 'medium' CHECK (engagement IN ('high', 'medium', 'low')),
  last_contact DATE,
  revenue NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dealers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read dealers" ON public.dealers FOR SELECT TO authenticated USING (true);
CREATE TRIGGER update_dealers_updated_at BEFORE UPDATE ON public.dealers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Contacts (directory)
CREATE TABLE public.contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  role TEXT CHECK (role IN ('dealer', 'rep', 'manager', 'other')),
  title TEXT,
  phone TEXT,
  cell TEXT,
  email TEXT,
  website TEXT,
  territory TEXT,
  assigned_to TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read contacts" ON public.contacts FOR SELECT TO authenticated USING (true);
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- KPI Records
CREATE TABLE public.kpi_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rep_id UUID NOT NULL REFERENCES public.sales_reps(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  year INTEGER NOT NULL,
  revenue NUMERIC(12,2) DEFAULT 0,
  quota NUMERIC(12,2) DEFAULT 0,
  dealer_visits INTEGER DEFAULT 0,
  new_dealers INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  conversion_rate NUMERIC(5,4) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rep_id, month, year)
);
ALTER TABLE public.kpi_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read kpi_records" ON public.kpi_records FOR SELECT TO authenticated USING (true);

-- Activities
CREATE TABLE public.activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT CHECK (type IN ('call', 'email', 'meeting', 'task', 'alert')),
  title TEXT NOT NULL,
  description TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  related_to TEXT,
  related_type TEXT CHECK (related_type IN ('rep', 'dealer', 'territory')),
  manager_id UUID REFERENCES public.managers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read activities" ON public.activities FOR SELECT TO authenticated USING (true);

-- Tasks
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rep_id UUID REFERENCES public.sales_reps(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'completed', 'overdue')),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read tasks" ON public.tasks FOR SELECT TO authenticated USING (true);
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes for common queries
CREATE INDEX idx_sales_reps_manager ON public.sales_reps(manager_id);
CREATE INDEX idx_dealers_rep ON public.dealers(rep_id);
CREATE INDEX idx_dealers_territory ON public.dealers(territory_id);
CREATE INDEX idx_kpi_records_rep ON public.kpi_records(rep_id);
CREATE INDEX idx_tasks_rep ON public.tasks(rep_id);
CREATE INDEX idx_activities_manager ON public.activities(manager_id);
