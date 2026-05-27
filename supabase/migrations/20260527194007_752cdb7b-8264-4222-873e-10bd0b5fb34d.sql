
-- CRM accounts
CREATE TABLE public.crm_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  lifecycle_stage text NOT NULL DEFAULT 'prospect',
  status text NOT NULL DEFAULT 'active',
  assigned_rep_id uuid REFERENCES public.sales_reps(id) ON DELETE SET NULL,
  contact_first_name text,
  contact_last_name text,
  main_phone text,
  email text,
  website text,
  street_1 text,
  city text,
  state text,
  zip text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_accounts_rep ON public.crm_accounts(assigned_rep_id);
CREATE INDEX idx_crm_accounts_stage ON public.crm_accounts(lifecycle_stage);
CREATE INDEX idx_crm_accounts_state ON public.crm_accounts(state);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_accounts TO authenticated;
GRANT ALL ON public.crm_accounts TO service_role;

ALTER TABLE public.crm_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and managers can view accounts"
  ON public.crm_accounts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins and managers can insert accounts"
  ON public.crm_accounts FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins and managers can update accounts"
  ON public.crm_accounts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins can delete accounts"
  ON public.crm_accounts FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_crm_accounts_updated_at
  BEFORE UPDATE ON public.crm_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Stage history
CREATE TABLE public.crm_account_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.crm_accounts(id) ON DELETE CASCADE,
  from_stage text,
  to_stage text NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_stage_hist_account ON public.crm_account_stage_history(account_id);

GRANT SELECT, INSERT ON public.crm_account_stage_history TO authenticated;
GRANT ALL ON public.crm_account_stage_history TO service_role;

ALTER TABLE public.crm_account_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and managers can view stage history"
  ON public.crm_account_stage_history FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins and managers can insert stage history"
  ON public.crm_account_stage_history FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Notes
CREATE TABLE public.crm_account_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.crm_accounts(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_crm_notes_account ON public.crm_account_notes(account_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_account_notes TO authenticated;
GRANT ALL ON public.crm_account_notes TO service_role;

ALTER TABLE public.crm_account_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and managers can view notes"
  ON public.crm_account_notes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins and managers can insert notes"
  ON public.crm_account_notes FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins and managers can update notes"
  ON public.crm_account_notes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins can delete notes"
  ON public.crm_account_notes FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Auto-log stage changes
CREATE OR REPLACE FUNCTION public.log_crm_stage_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.crm_account_stage_history (account_id, from_stage, to_stage, changed_by)
    VALUES (NEW.id, NULL, NEW.lifecycle_stage, NEW.created_by);
  ELSIF NEW.lifecycle_stage IS DISTINCT FROM OLD.lifecycle_stage THEN
    INSERT INTO public.crm_account_stage_history (account_id, from_stage, to_stage, changed_by)
    VALUES (NEW.id, OLD.lifecycle_stage, NEW.lifecycle_stage, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_crm_log_stage_insert
  AFTER INSERT ON public.crm_accounts
  FOR EACH ROW EXECUTE FUNCTION public.log_crm_stage_change();

CREATE TRIGGER trg_crm_log_stage_update
  AFTER UPDATE ON public.crm_accounts
  FOR EACH ROW EXECUTE FUNCTION public.log_crm_stage_change();
