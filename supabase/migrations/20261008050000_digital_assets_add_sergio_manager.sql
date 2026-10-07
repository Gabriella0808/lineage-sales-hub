-- Adds Sergio to the Digital Assets upload/manage allowlist, alongside
-- Gabriella/Scott/Justin/Andrew (20261008040000). Sergio gets upload/
-- rename/move/delete rights in Digital Assets specifically - this does
-- NOT make him an admin anywhere else in the app (that's a separate,
-- unrelated email list - has_effective_role()'s admin override).
CREATE OR REPLACE FUNCTION public.is_digital_assets_manager()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
  SELECT lower(auth.email()) IN (
    'gabriella@lineage-collections.com',
    'scott@lineage-collections.com',
    'justin@lineage-collections.com',
    'andrew@lineage-collections.com',
    'sergio@lineage-collections.com'
  );
$$;
