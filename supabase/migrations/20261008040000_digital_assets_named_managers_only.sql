-- Digital Assets upload/manage access is now restricted to 4 named people
-- (Gabriella, Scott, Justin, Andrew) specifically - not the admin/manager
-- role generally. Every other role, including other admins/managers, gets
-- view + download only, the same as a rep. Read access is unchanged (every
-- role that can already see the page still can).
--
-- These 4 exact emails already have an established precedent elsewhere in
-- the app (has_effective_role()'s own admin-email override list) - reused
-- here, but as its own explicit, page-specific check rather than piggy-
-- backing on the general admin role, since that role is broader than just
-- these 4 people and could include someone else via an explicit user_roles
-- row.

CREATE OR REPLACE FUNCTION public.is_digital_assets_manager()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
  SELECT lower(auth.email()) IN (
    'gabriella@lineage-collections.com',
    'scott@lineage-collections.com',
    'justin@lineage-collections.com',
    'andrew@lineage-collections.com'
  );
$$;

DROP POLICY "digital_asset_folders write admin or manager" ON public.digital_asset_folders;
DROP POLICY "digital_asset_folders update admin or manager" ON public.digital_asset_folders;
DROP POLICY "digital_asset_folders delete admin or manager" ON public.digital_asset_folders;
CREATE POLICY "digital_asset_folders write named managers" ON public.digital_asset_folders FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.is_digital_assets_manager());
CREATE POLICY "digital_asset_folders update named managers" ON public.digital_asset_folders FOR UPDATE TO authenticated
  USING (public.is_digital_assets_manager())
  WITH CHECK (public.is_digital_assets_manager());
CREATE POLICY "digital_asset_folders delete named managers" ON public.digital_asset_folders FOR DELETE TO authenticated
  USING (public.is_digital_assets_manager());

DROP POLICY "digital_assets write admin or manager" ON public.digital_assets;
DROP POLICY "digital_assets update admin or manager" ON public.digital_assets;
DROP POLICY "digital_assets delete admin or manager" ON public.digital_assets;
CREATE POLICY "digital_assets write named managers" ON public.digital_assets FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid() AND public.is_digital_assets_manager());
CREATE POLICY "digital_assets update named managers" ON public.digital_assets FOR UPDATE TO authenticated
  USING (public.is_digital_assets_manager())
  WITH CHECK (public.is_digital_assets_manager());
CREATE POLICY "digital_assets delete named managers" ON public.digital_assets FOR DELETE TO authenticated
  USING (public.is_digital_assets_manager());

DROP POLICY "digital-assets write admin or manager" ON storage.objects;
DROP POLICY "digital-assets delete admin or manager" ON storage.objects;
CREATE POLICY "digital-assets write named managers" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'digital-assets' AND public.is_digital_assets_manager());
CREATE POLICY "digital-assets delete named managers" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'digital-assets' AND public.is_digital_assets_manager());
