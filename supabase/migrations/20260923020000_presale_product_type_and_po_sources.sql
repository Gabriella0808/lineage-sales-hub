-- Two additions for the Pre-Sale section, matching Andrew's validated
-- Acctivate SQL (New-Product-Intro reporting) exactly:
--
-- 1. products.product_type - Acctivate's Product.ProductType, a second
--    breakdown dimension alongside product_class (collection). Andrew's
--    reference queries group by ProductClass + ProductType together.
--
-- 2. presale_po_lines / presale_po_summary - a dedicated sync of Acctivate's
--    PODetail + POManagementSummary tables, scoped to New Product Intro
--    SKUs only. Replaces reliance on portal_acctivate_po_lines for this
--    feature: that table isn't produced by any script in this repo, so it
--    can't be verified against Andrew's validated source tables. This new
--    pair mirrors his POAmountSource/FirstPODateSource queries directly.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type text;

CREATE TABLE IF NOT EXISTS public.presale_po_lines (
  guid_po_detail        text PRIMARY KEY,
  guid_po                text NOT NULL,
  po_number               text,
  product_id              text NOT NULL,
  display_amount           numeric NOT NULL DEFAULT 0,
  quantity_outstanding     numeric NOT NULL DEFAULT 0,
  synced_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_presale_po_lines_product_id ON public.presale_po_lines (product_id);
CREATE INDEX IF NOT EXISTS idx_presale_po_lines_guid_po ON public.presale_po_lines (guid_po);

CREATE TABLE IF NOT EXISTS public.presale_po_summary (
  guid_po                  text PRIMARY KEY,
  po_number                text,
  po_status                text,
  requested_delivery_date  date,
  synced_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.presale_po_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presale_po_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read presale PO lines"
  ON public.presale_po_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read presale PO summary"
  ON public.presale_po_summary FOR SELECT TO authenticated USING (true);
