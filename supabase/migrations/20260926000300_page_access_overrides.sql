-- Stage 3 of the portal permissions work: DB-backed page access that Gabriella
-- can edit from the Portal Access page.
--
-- MODEL: the code in config/pageAccess.ts stays the default. These tables only
-- hold DELIBERATE CHANGES on top of it, so an empty/unreachable table means the
-- portal behaves exactly as coded (fail-safe). Precedence, most specific first:
--   1. a per-person override   (page_access_user_overrides, keyed by email)
--   2. a per-role/profile override (page_access_role_overrides)
--   3. the coded rule
-- "menu" = shown in the sidebar, "route" = can open the page by its address.
-- NULL = no override for that half. Only Gabriella's account can write; every
-- change is recorded in page_access_audit.
--
-- The 'portal-access' page can never be overridden (so the editor can't lock
-- its own owner out).
--
-- SEED: customer-service accounts are limited to the pages their menu already
-- shows (Home, My Tasks, Dealers, Settings). They previously could open ~20 more
-- manager pages by typing the address, because their saved role is "manager".

BEGIN;

CREATE OR REPLACE FUNCTION public.is_portal_access_admin()
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public
AS $$ SELECT lower(coalesce(auth.email(), '')) = 'gabriella@lineage-collections.com' $$;

-- Which accounts belong to a special profile (currently only customer service).
CREATE TABLE public.portal_access_profiles (
  email text PRIMARY KEY CHECK (email = lower(email)),
  profile text NOT NULL CHECK (profile IN ('customer_service')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.page_access_role_overrides (
  page_key text NOT NULL CHECK (page_key <> 'portal-access'),
  profile text NOT NULL CHECK (profile IN ('admin','manager','rep','dealer','customer_service')),
  menu boolean,
  route boolean,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  PRIMARY KEY (page_key, profile),
  CHECK (menu IS NOT NULL OR route IS NOT NULL)
);

CREATE TABLE public.page_access_user_overrides (
  page_key text NOT NULL CHECK (page_key <> 'portal-access'),
  email text NOT NULL CHECK (email = lower(email)),
  menu boolean,
  route boolean,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  PRIMARY KEY (page_key, email),
  CHECK (menu IS NOT NULL OR route IS NOT NULL)
);

CREATE TABLE public.page_access_audit (
  id bigserial PRIMARY KEY,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by text,
  scope text NOT NULL,          -- 'role' or 'person'
  target text NOT NULL,         -- the profile or the email
  page_key text NOT NULL,
  action text NOT NULL,         -- 'set' | 'changed' | 'reset'
  old_menu boolean, old_route boolean,
  new_menu boolean, new_route boolean
);

-- Audit every change to either override table.
CREATE OR REPLACE FUNCTION public.page_access_audit_fn()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  who text := coalesce(auth.email(), 'system (migration)');
  scope_ text := CASE TG_TABLE_NAME WHEN 'page_access_role_overrides' THEN 'role' ELSE 'person' END;
  tgt text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    tgt := coalesce(to_jsonb(OLD)->>'profile', to_jsonb(OLD)->>'email');
    INSERT INTO public.page_access_audit (changed_by, scope, target, page_key, action, old_menu, old_route)
    VALUES (who, scope_, tgt, OLD.page_key, 'reset', OLD.menu, OLD.route);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    tgt := coalesce(to_jsonb(NEW)->>'profile', to_jsonb(NEW)->>'email');
    INSERT INTO public.page_access_audit (changed_by, scope, target, page_key, action, old_menu, old_route, new_menu, new_route)
    VALUES (who, scope_, tgt, NEW.page_key, 'changed', OLD.menu, OLD.route, NEW.menu, NEW.route);
    RETURN NEW;
  ELSE
    tgt := coalesce(to_jsonb(NEW)->>'profile', to_jsonb(NEW)->>'email');
    INSERT INTO public.page_access_audit (changed_by, scope, target, page_key, action, new_menu, new_route)
    VALUES (who, scope_, tgt, NEW.page_key, 'set', NEW.menu, NEW.route);
    RETURN NEW;
  END IF;
END $$;

CREATE TRIGGER trg_audit_role_overrides AFTER INSERT OR UPDATE OR DELETE ON public.page_access_role_overrides
  FOR EACH ROW EXECUTE FUNCTION public.page_access_audit_fn();
CREATE TRIGGER trg_audit_user_overrides AFTER INSERT OR UPDATE OR DELETE ON public.page_access_user_overrides
  FOR EACH ROW EXECUTE FUNCTION public.page_access_audit_fn();

-- Row-level security: everyone signed in can READ what applies to them (needed
-- to render the menu and guard routes); only Gabriella can write or see everything.
ALTER TABLE public.portal_access_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_access_role_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_access_user_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_access_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_read_own ON public.portal_access_profiles FOR SELECT TO authenticated
  USING (email = lower(coalesce(auth.email(), '')) OR public.is_portal_access_admin());
CREATE POLICY profiles_admin_write ON public.portal_access_profiles FOR ALL TO authenticated
  USING (public.is_portal_access_admin()) WITH CHECK (public.is_portal_access_admin());

CREATE POLICY role_overrides_read ON public.page_access_role_overrides FOR SELECT TO authenticated USING (true);
CREATE POLICY role_overrides_admin_write ON public.page_access_role_overrides FOR ALL TO authenticated
  USING (public.is_portal_access_admin()) WITH CHECK (public.is_portal_access_admin());

CREATE POLICY user_overrides_read_own ON public.page_access_user_overrides FOR SELECT TO authenticated
  USING (email = lower(coalesce(auth.email(), '')) OR public.is_portal_access_admin());
CREATE POLICY user_overrides_admin_write ON public.page_access_user_overrides FOR ALL TO authenticated
  USING (public.is_portal_access_admin()) WITH CHECK (public.is_portal_access_admin());

CREATE POLICY audit_admin_read ON public.page_access_audit FOR SELECT TO authenticated
  USING (public.is_portal_access_admin());

REVOKE ALL ON public.portal_access_profiles, public.page_access_role_overrides,
  public.page_access_user_overrides, public.page_access_audit FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_access_profiles, public.page_access_role_overrides,
  public.page_access_user_overrides TO authenticated;
GRANT SELECT ON public.page_access_audit TO authenticated;

-- Seed: customer-service accounts and their limited page set.
INSERT INTO public.portal_access_profiles (email, profile) VALUES
  ('tammy@lineage-collections.com', 'customer_service'),
  ('jessica@lineage-collections.com', 'customer_service'),
  ('melissa@lineage-collections.com', 'customer_service'),
  ('michelle@lineage-collections.com', 'customer_service'),
  ('miranda@lineage-collections.com', 'customer_service'),
  ('sarah@lineage-collections.com', 'customer_service');

INSERT INTO public.page_access_role_overrides (page_key, profile, menu, route) VALUES
  ('home', 'customer_service', NULL, true),
  ('company-wide', 'customer_service', true, true),
  ('team-performance', 'customer_service', true, NULL),
  ('my-performance', 'customer_service', true, NULL),
  ('kpi', 'customer_service', NULL, false),
  ('reports-bookings', 'customer_service', NULL, false),
  ('reports-invoicing', 'customer_service', NULL, false),
  ('my-tasks', 'customer_service', true, true),
  ('monday-boards', 'customer_service', NULL, false),
  ('meeting-intelligence', 'customer_service', false, false),
  ('product-catalog', 'customer_service', false, false),
  ('product-detail', 'customer_service', NULL, false),
  ('cart', 'customer_service', false, false),
  ('my-quotes', 'customer_service', false, false),
  ('customer-quotes', 'customer_service', false, false),
  ('customer-quote-new', 'customer_service', NULL, false),
  ('customer-quote-edit', 'customer_service', NULL, false),
  ('digital-assets', 'customer_service', false, false),
  ('sales-targets', 'customer_service', false, false),
  ('field-check-ins', 'customer_service', false, false),
  ('prospects', 'customer_service', false, false),
  ('prospect-reporting', 'customer_service', false, false),
  ('prospects-analytics', 'customer_service', NULL, false),
  ('prospect-new', 'customer_service', NULL, false),
  ('prospect-detail', 'customer_service', NULL, false),
  ('visit-analytics', 'customer_service', false, false),
  ('travel-log', 'customer_service', false, false),
  ('trade-show-leads', 'customer_service', false, false),
  ('capture-leads', 'customer_service', false, false),
  ('hp-appointments', 'customer_service', false, false),
  ('holiday-promotions', 'customer_service', false, NULL),
  ('labor-day-promo', 'customer_service', false, false),
  ('discontinued-products', 'customer_service', false, false),
  ('discontinued-analytics', 'customer_service', false, false),
  ('pre-sale', 'customer_service', false, false),
  ('dealers', 'customer_service', true, true),
  ('directory', 'customer_service', false, false),
  ('inventory', 'customer_service', false, false),
  ('org-chart', 'customer_service', false, false),
  ('sales-managers', 'customer_service', false, false),
  ('reps-acctivate', 'customer_service', false, false),
  ('rep-login-activity', 'customer_service', false, false),
  ('desktop-app', 'customer_service', false, false),
  ('settings', 'customer_service', true, true);

COMMIT;
