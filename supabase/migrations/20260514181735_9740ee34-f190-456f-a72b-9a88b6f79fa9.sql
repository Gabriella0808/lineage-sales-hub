ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_urls text[];
CREATE INDEX IF NOT EXISTS idx_products_image_urls ON public.products USING GIN(image_urls);