-- Digital Assets: a Dropbox-style media/document library. Admin and manager
-- can upload, create folders, rename, move, and delete; every role that can
-- see the page (admin, manager, rep, dealer - page_access.ts already lists
-- "digital-assets" as ALL-role) can browse, open, and download.
--
-- Uses has_effective_role() (not has_role()) for the write checks, same as
-- Team Updates - has_role() alone misses the many managers/reps who only
-- have an implicit role via user_managers/user_reps, not an explicit
-- user_roles row (the exact bug fixed in 20260930080000).

BEGIN;

CREATE TABLE public.digital_asset_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  parent_folder_id uuid REFERENCES public.digital_asset_folders(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.digital_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid REFERENCES public.digital_asset_folders(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  file_path text NOT NULL UNIQUE,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_digital_asset_folders_parent ON public.digital_asset_folders(parent_folder_id);
CREATE INDEX idx_digital_assets_folder ON public.digital_assets(folder_id);

-- No two folders (or two files) with the same name side by side in the same
-- location - same expectation as Dropbox. NULLS NOT DISTINCT so this also
-- applies at the root (parent_folder_id / folder_id both null).
CREATE UNIQUE INDEX idx_digital_asset_folders_unique_name
  ON public.digital_asset_folders (parent_folder_id, lower(name)) NULLS NOT DISTINCT;
CREATE UNIQUE INDEX idx_digital_assets_unique_name
  ON public.digital_assets (folder_id, lower(name)) NULLS NOT DISTINCT;

CREATE TRIGGER update_digital_asset_folders_updated_at
  BEFORE UPDATE ON public.digital_asset_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_digital_assets_updated_at
  BEFORE UPDATE ON public.digital_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.digital_asset_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "digital_asset_folders read all roles" ON public.digital_asset_folders FOR SELECT TO authenticated
  USING (
    public.has_effective_role(auth.uid(), 'admin') OR public.has_effective_role(auth.uid(), 'manager')
    OR public.has_effective_role(auth.uid(), 'rep') OR public.has_effective_role(auth.uid(), 'dealer')
  );
CREATE POLICY "digital_asset_folders write admin or manager" ON public.digital_asset_folders FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (public.has_effective_role(auth.uid(), 'admin') OR public.has_effective_role(auth.uid(), 'manager'))
  );
CREATE POLICY "digital_asset_folders update admin or manager" ON public.digital_asset_folders FOR UPDATE TO authenticated
  USING (public.has_effective_role(auth.uid(), 'admin') OR public.has_effective_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_effective_role(auth.uid(), 'admin') OR public.has_effective_role(auth.uid(), 'manager'));
CREATE POLICY "digital_asset_folders delete admin or manager" ON public.digital_asset_folders FOR DELETE TO authenticated
  USING (public.has_effective_role(auth.uid(), 'admin') OR public.has_effective_role(auth.uid(), 'manager'));

CREATE POLICY "digital_assets read all roles" ON public.digital_assets FOR SELECT TO authenticated
  USING (
    public.has_effective_role(auth.uid(), 'admin') OR public.has_effective_role(auth.uid(), 'manager')
    OR public.has_effective_role(auth.uid(), 'rep') OR public.has_effective_role(auth.uid(), 'dealer')
  );
CREATE POLICY "digital_assets write admin or manager" ON public.digital_assets FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (public.has_effective_role(auth.uid(), 'admin') OR public.has_effective_role(auth.uid(), 'manager'))
  );
CREATE POLICY "digital_assets update admin or manager" ON public.digital_assets FOR UPDATE TO authenticated
  USING (public.has_effective_role(auth.uid(), 'admin') OR public.has_effective_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_effective_role(auth.uid(), 'admin') OR public.has_effective_role(auth.uid(), 'manager'));
CREATE POLICY "digital_assets delete admin or manager" ON public.digital_assets FOR DELETE TO authenticated
  USING (public.has_effective_role(auth.uid(), 'admin') OR public.has_effective_role(auth.uid(), 'manager'));

REVOKE ALL ON public.digital_asset_folders, public.digital_assets FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.digital_asset_folders, public.digital_assets TO authenticated;

-- Storage bucket - same allowed types and 500MB cap already proven out for
-- Team Updates attachments (images, PDF, Word/Excel/PowerPoint, CSV, text,
-- RTF, zip, video).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'digital-assets',
  'digital-assets',
  false,
  524288000,
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/csv',
    'text/plain',
    'application/rtf',
    'application/zip',
    'application/x-zip-compressed',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-msvideo'
  ]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "digital-assets write admin or manager" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'digital-assets' AND (public.has_effective_role(auth.uid(), 'admin') OR public.has_effective_role(auth.uid(), 'manager')));
CREATE POLICY "digital-assets read all roles" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'digital-assets' AND (
      public.has_effective_role(auth.uid(), 'admin') OR public.has_effective_role(auth.uid(), 'manager')
      OR public.has_effective_role(auth.uid(), 'rep') OR public.has_effective_role(auth.uid(), 'dealer')
    )
  );
CREATE POLICY "digital-assets delete admin or manager" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'digital-assets' AND (public.has_effective_role(auth.uid(), 'admin') OR public.has_effective_role(auth.uid(), 'manager')));

COMMIT;
