-- Per-user starring for Digital Assets (folders and files), powering the
-- "Starred" quick filter. Each person stars their own items - same as
-- Dropbox's own per-user star, not a shared/global flag.

CREATE TABLE public.digital_asset_stars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  item_type text NOT NULL CHECK (item_type IN ('folder', 'asset')),
  item_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_type, item_id)
);

CREATE INDEX idx_digital_asset_stars_user ON public.digital_asset_stars(user_id);

ALTER TABLE public.digital_asset_stars ENABLE ROW LEVEL SECURITY;

-- A person only ever sees/manages their own stars.
CREATE POLICY "digital_asset_stars own rows" ON public.digital_asset_stars FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.digital_asset_stars FROM anon;
GRANT SELECT, INSERT, DELETE ON public.digital_asset_stars TO authenticated;
