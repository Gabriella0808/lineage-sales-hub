CREATE TABLE IF NOT EXISTS public._ci_import_stage (
  cust_id text,
  acct_name text,
  rep_email text,
  visit_date date,
  notes text,
  brand text,
  new_placement text,
  log_type text,
  outcome text
);
ALTER TABLE public._ci_import_stage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage ci stage" ON public._ci_import_stage FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());