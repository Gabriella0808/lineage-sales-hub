CREATE TABLE IF NOT EXISTS public.clearance_weekly_sales (
  id             uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  import_id      uuid    NOT NULL,
  import_filename text,
  week_start     date    NOT NULL,
  sku            text    NOT NULL,
  product_name   text,
  qty_sold       integer NOT NULL DEFAULT 0,
  revenue        numeric DEFAULT 0,
  rep_name       text,
  imported_by    uuid    REFERENCES auth.users(id),
  created_at     timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS clearance_weekly_sales_week_start_idx ON public.clearance_weekly_sales (week_start);
CREATE INDEX IF NOT EXISTS clearance_weekly_sales_sku_idx ON public.clearance_weekly_sales (sku);
CREATE INDEX IF NOT EXISTS clearance_weekly_sales_import_id_idx ON public.clearance_weekly_sales (import_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clearance_weekly_sales TO authenticated;
GRANT ALL ON public.clearance_weekly_sales TO service_role;
ALTER TABLE public.clearance_weekly_sales ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='clearance_weekly_sales' AND policyname='Staff all clearance_weekly_sales') THEN
    CREATE POLICY "Staff all clearance_weekly_sales" ON public.clearance_weekly_sales FOR ALL TO authenticated USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());
  END IF;
END $$;

DELETE FROM public.clearance_weekly_sales WHERE week_start = '2026-06-08';

INSERT INTO public.clearance_weekly_sales (import_id, import_filename, week_start, sku, product_name, qty_sold, revenue, rep_name) VALUES
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','B90035-DWHITE',NULL,1,459.0,'Andrew Smith'),
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','B90040-DWHITE',NULL,1,239.0,'Andrew Smith'),
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','B77732-SAND',NULL,2,538.0,'Brent Holbrook'),
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','B77733-SAND',NULL,2,598.0,'Brent Holbrook'),
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','B77736-SAND',NULL,1,699.0,'Brent Holbrook'),
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','B77741-SAND',NULL,1,348.0,'Internet - BrandJump'),
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','FL-B70033-EARTHCLAY',NULL,2,674.0,'Internet - BrandJump'),
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','FL-B70037-EARTHCLAY',NULL,1,799.0,'Carolinas - Ervin'),
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','FL-B70040-EARTHCLAY',NULL,1,329.0,'Bruce Quillen'),
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','FL-B70040FB-EARTHCLAY',NULL,1,170.0,'Bruce Quillen'),
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','FL-B70041-EARTHCLAY',NULL,1,449.0,'Internet - BrandJump'),
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','FL-B70041FB-EARTHCLAY',NULL,1,225.0,'Internet - BrandJump'),
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','FL-B700SR-QK-EARTHCLAY',NULL,1,113.0,'Internet - BrandJump'),
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','FL-B700SR-QK-EARTHCLAY',NULL,1,100.0,'Bruce Quillen'),
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','FL-D65080-FRESHWHITE',NULL,6,810.0,'Carolinas - Ervin'),
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','FL-D65085-FRESHWHITE',NULL,1,675.0,'Carolinas - Ervin'),
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','FL-D70081-EARTHCLAY',NULL,4,476.0,'Central Florida - Durham'),
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','FL-D70082-EARTHCLAY',NULL,2,278.0,'Central Florida - Durham'),
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','FL-D70086-BASE-EARTHCLAY',NULL,1,149.0,'Central Florida - Durham'),
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','FL-D70086-BASE-EARTHCLAY',NULL,1,149.0,'Stewart Hunt'),
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','FL-D70086-TOP-EARTHCLAY',NULL,1,350.0,'Central Florida - Durham'),
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','FL-D70086-TOP-EARTHCLAY',NULL,1,350.0,'Stewart Hunt'),
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','B90002-DWHITE',NULL,1,199.0,'Carolinas - Ervin'),
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','B90003-DWHITE',NULL,1,299.0,'Carolinas - Ervin'),
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','B90004-DWHITE',NULL,1,275.0,'Carolinas - Ervin'),
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','B90005-DWHITE',NULL,4,756.0,'Brent Holbrook'),
('11111111-1111-1111-1111-111111111111','clearancereport.CSV','2026-06-08','B90005-DWHITE',NULL,1,189.0,'Carolinas - Ervin');