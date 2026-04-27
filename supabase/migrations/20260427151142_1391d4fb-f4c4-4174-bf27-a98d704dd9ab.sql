CREATE TABLE IF NOT EXISTS public._dealer_owner_staging (
  dealer_id uuid PRIMARY KEY,
  owner text NOT NULL
);
ALTER TABLE public._dealer_owner_staging ENABLE ROW LEVEL SECURITY;