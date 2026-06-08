-- Stores weekly clearance product sales imported via CSV.
-- Each row is one SKU from one import batch.
-- import_id groups all rows that came from the same CSV upload.
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
CREATE INDEX IF NOT EXISTS clearance_weekly_sales_sku_idx        ON public.clearance_weekly_sales (sku);
CREATE INDEX IF NOT EXISTS clearance_weekly_sales_import_id_idx  ON public.clearance_weekly_sales (import_id);

ALTER TABLE public.clearance_weekly_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff all clearance_weekly_sales" ON public.clearance_weekly_sales
  FOR ALL TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());
