-- Bug fix: Dealer/Rep Reporting's invoiced/booking line facts
-- (get_portal_dealer_rep_reporting_lines, v_portal_bookings_line_facts,
-- get_portal_invoiced_lines) carry product_class as a full, human-
-- readable description ("ISLAMORADA", "CREDENZAS", "CAPE MAY
-- DRIFTWOOD"), NOT the short Acctivate ProductClassID code
-- ("ISLAMORA", "CREDENZA", "CMAYDRIF") that `products.collection`
-- uses - see InvoiceDetailSheet.tsx's own toCollectionDisplayName()
-- comment, which has always had to handle both formats for that
-- reason. v_active_acctivate_collection_codes only ever matched the
-- short-code format, so on real Dealer/Rep Reporting data almost every
-- collection silently failed to match and only a handful of
-- single-word, format-coincidental names (Maui, Monterey, Surfside)
-- showed up as filter options - confirmed live, not theoretical.
--
-- Fix, in two parts:
-- 1. Add the actual descriptive-name spellings seen in real line data
--    as additional rows in acctivate_collection_codes, pointing at the
--    same canonical display_name as their short-code sibling. Known
--    non-collection descriptive values (DISCOUNT, E-COMM ALLOWANCE, QC
--    FACTORY/FREIGHT/INTERNAL, RETURNS, LAMPS COASTAL/TRADITIONAL/
--    TRANSITIONAL) are deliberately NOT added - InvoiceDetailSheet.tsx's
--    own KNOWN_COLLECTION_NAMES already excludes Lamps sub-classes for
--    the same reason, and the others match this task's own explicit
--    exclusion list.
-- 2. Recompute "active" at the display_name level, not the raw code
--    level: a collection is active if ANY of its spelling variants
--    (short code or descriptive) has a product in `products` right
--    now - so a code-format row and its descriptive-format sibling
--    always agree on active/inactive, regardless of which format
--    `products.collection` itself happens to use.

BEGIN;

INSERT INTO public.acctivate_collection_codes (code, display_name, brand) VALUES
  ('ISLAMORADA',            'Islamorada',   'Sea Winds'),
  ('CAPE MAY DRIFTWOOD',    'Cape May',     'Sea Winds'),
  ('CHATHAM MAPLE',         'Chatham Maple','Finn & Lou'),
  ('CHATHAM MIDNIGHT',      'Chatham Midnight', 'Finn & Lou'),
  ('CREDENZAS',             'Credenza',     'Sea Winds'),
  ('CABINET BEDS',          'Cabinet Beds', 'Sea Winds'),
  ('MANHATTAN VALLEY DARK', 'MHV Dark',     'Finn & Lou'),
  ('MANHATTAN VALLEY LIGHT','MHV Light',    'Finn & Lou'),
  ('MONACO BLANC',          'Monaco',       'Sea Winds'),
  ('MONACO BLEU',           'Monaco',       'Sea Winds'),
  ('OCEAN ISLES',           'Ocean Isle',   'Sea Winds'),
  ('PICKET FENCE OCCASSIONAL', 'Picket Fence', 'Sea Winds'),
  ('POINT BREEZE WHITE',    'Point Breeze', 'Finn & Lou'),
  ('RIO VISTA',             'Rio Vista',    'Finn & Lou'),
  ('SUN HAVEN',             'Sun Haven',    'Sea Winds')
ON CONFLICT (code) DO UPDATE SET display_name = EXCLUDED.display_name, brand = EXCLUDED.brand;

CREATE OR REPLACE VIEW public.v_active_acctivate_collection_codes AS
SELECT DISTINCT acc.code, acc.display_name, acc.brand
FROM public.acctivate_collection_codes acc
WHERE acc.display_name IN (
  SELECT DISTINCT acc2.display_name
  FROM public.acctivate_collection_codes acc2
  JOIN public.products p ON upper(trim(p.collection)) = acc2.code
  WHERE p.collection IS NOT NULL AND trim(p.collection) <> ''
);

COMMIT;
