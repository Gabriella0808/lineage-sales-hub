
-- Add notes column to dealers if not exists
ALTER TABLE public.dealers ADD COLUMN IF NOT EXISTS notes TEXT;

-- Recreate staging table for bulk update
DROP TABLE IF EXISTS public._dealer_info_staging;
CREATE TABLE public._dealer_info_staging (
  name TEXT,
  norm_name TEXT,
  city TEXT,
  state TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  notes TEXT
);
