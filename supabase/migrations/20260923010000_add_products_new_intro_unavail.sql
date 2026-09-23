-- Backs the new "Pre-Sale" reporting section: products.new_intro_unavail
-- mirrors Acctivate's tbProduct._NewIntroUnavail custom field (checked by
-- staff on a product to mark it a "new product intro"). A SKU counts as
-- pre-sale exactly while this is true — unchecking it in Acctivate and
-- re-syncing removes the SKU from Pre-Sale reporting on the next sync, with
-- no change needed to historical order/booking rows, since reporting always
-- joins against this current flag rather than a value frozen at order time.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS new_intro_unavail boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_new_intro_unavail
  ON public.products (new_intro_unavail)
  WHERE new_intro_unavail = true;
