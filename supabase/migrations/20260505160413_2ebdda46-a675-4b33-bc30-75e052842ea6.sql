
-- Reorder model overrides + segregation columns
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS units_l12m numeric,
  ADD COLUMN IF NOT EXISTS units_l6m numeric,
  ADD COLUMN IF NOT EXISTS units_l3m numeric,
  ADD COLUMN IF NOT EXISTS on_po numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS on_sales_order numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS in_transit numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS on_hand_nc numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS on_hand_vn numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reorder_basis text DEFAULT 'L12M',
  ADD COLUMN IF NOT EXISTS reorder_override_per_week numeric,
  ADD COLUMN IF NOT EXISTS lead_time_months numeric DEFAULT 4.5,
  ADD COLUMN IF NOT EXISTS cubes numeric,
  ADD COLUMN IF NOT EXISTS reorder_min numeric,
  ADD COLUMN IF NOT EXISTS reorder_max numeric,
  ADD COLUMN IF NOT EXISTS is_clearance boolean NOT NULL DEFAULT false;
