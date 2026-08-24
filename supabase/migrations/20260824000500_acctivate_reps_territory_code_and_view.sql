-- Add territory_code column to acctivate_sales_reps so the sync script can
-- store the short code separately from the human-readable territory_name.
ALTER TABLE public.acctivate_sales_reps
  ADD COLUMN IF NOT EXISTS territory_code TEXT;

-- Drop and recreate the frontend-friendly view so it can be run safely on
-- re-migrations. All portal pages that need rep info should query this view
-- rather than the underlying table directly -- it provides stable aliases so
-- pages that expect salesperson_id, rep_name, sales_manager, territory, or
-- status never need to know the underlying column names.
DROP VIEW IF EXISTS public.v_acctivate_sales_reps;

CREATE VIEW public.v_acctivate_sales_reps AS
SELECT
  id,
  -- Stable Acctivate identifiers (all three alias to the same value)
  acctivate_id,
  acctivate_id                                         AS rep_id,
  acctivate_id                                         AS salesperson_id,
  rep_code,

  -- Name aliases
  name                                                 AS rep_name,
  name,

  -- Contact
  email,
  phone,

  -- Manager aliases
  manager_acctivate_id,
  manager_name,
  manager_name                                         AS sales_manager,

  -- Territory aliases
  territory_acctivate_id,
  territory_name,
  territory_name                                       AS territory,
  territory_code,

  -- Status aliases
  active                                               AS is_active,
  active,
  CASE WHEN active THEN 'Active' ELSE 'Inactive' END   AS status,

  synced_at
FROM public.acctivate_sales_reps;

-- Grant the same access as the underlying table.
GRANT SELECT ON public.v_acctivate_sales_reps TO authenticated;
GRANT SELECT ON public.v_acctivate_sales_reps TO service_role;

-- RLS does not apply to views by default in Postgres; access is controlled by
-- the underlying table's RLS policies (already set on acctivate_sales_reps).
