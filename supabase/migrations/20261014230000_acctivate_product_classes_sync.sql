-- Collection filter names must come STRICTLY from Acctivate - not a
-- hand-typed mapping. Adds a new synced table mirroring Acctivate's own
-- Product Class master list exactly (code + Acctivate's own
-- description), via the same Sync-Acctivate.ps1 pipeline every other
-- Acctivate table already uses - see New-AcctivateProductClassesQuery
-- in that script.
--
-- This also caught a real error in the OLD hand-typed
-- acctivate_collection_codes mapping (ported from a pre-existing guess
-- elsewhere in this codebase): LUXCOAST/LUXTRAD/LUXTRANS were labeled
-- "Lux Coast/Traditional/Transitional," a furniture collection -
-- Acctivate's own Description field for these codes is actually "Lamps
-- Coastal/Traditional/Transitional." Removed - Lamps sub-classes were
-- already correctly excluded everywhere else (see
-- InvoiceDetailSheet.tsx's KNOWN_COLLECTION_NAMES comment).

BEGIN;

CREATE TABLE IF NOT EXISTS public.acctivate_product_classes (
  acctivate_id text PRIMARY KEY, -- Acctivate's own ProductClassID, e.g. "ISLAMORA"
  description text,              -- Acctivate's own Description field, verbatim
  active boolean NOT NULL DEFAULT true, -- Acctivate's own Active checkbox (kept for reference - does not by itself distinguish real collections from administrative classes; see below)
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.acctivate_product_classes FROM anon;
GRANT SELECT ON public.acctivate_product_classes TO authenticated;

-- Correcting the Lux/Lamps mix-up described above.
DELETE FROM public.acctivate_collection_codes WHERE code IN ('LUXCOAST', 'LUXTRAD', 'LUXTRANS');

-- Correcting several more display names now that Acctivate's own
-- Product Class screen has been directly confirmed - these were
-- approximated/shortened guesses (carried over from the pre-existing
-- InvoiceDetailSheet.tsx map this was originally ported from) that
-- don't match Acctivate's actual Description field. Short-code rows
-- (CMAYDRIF, CREDENZA, MHVDARK, MHVLIGHT, PICKET, PTBREEZE) corrected
-- to Acctivate's real wording; the Monaco Blanc/Bleu finishes are kept
-- as two distinct names (not merged into "Monaco") since Acctivate
-- itself describes them as two different values.
UPDATE public.acctivate_collection_codes SET display_name = 'Cape May Driftwood' WHERE code = 'CMAYDRIF';
UPDATE public.acctivate_collection_codes SET display_name = 'Credenzas' WHERE code = 'CREDENZA';
UPDATE public.acctivate_collection_codes SET display_name = 'Manhattan Valley Dark' WHERE code = 'MHVDARK';
UPDATE public.acctivate_collection_codes SET display_name = 'Manhattan Valley Light' WHERE code = 'MHVLIGHT';
UPDATE public.acctivate_collection_codes SET display_name = 'Monaco Blanc' WHERE code = 'MONBLANC';
UPDATE public.acctivate_collection_codes SET display_name = 'Monaco Bleu' WHERE code = 'MONBLEU';
UPDATE public.acctivate_collection_codes SET display_name = 'Ocean Isles' WHERE code = 'OCEANISL';
UPDATE public.acctivate_collection_codes SET display_name = 'Picket Fence Occassional' WHERE code = 'PICKET';
UPDATE public.acctivate_collection_codes SET display_name = 'Point Breeze White' WHERE code = 'PTBREEZE';

-- The descriptive-format aliases from 20261014220000_collection_code_
-- aliases_fix.sql need the same correction - NOT deleted, despite
-- looking like a redundant duplicate of their short-code sibling: that
-- migration added them because Dealer/Rep Reporting's own invoiced/
-- booking line facts carry product_class as this full descriptive
-- string, not the short Acctivate code products.collection uses, so
-- both spellings have to resolve to the same corrected display_name for
-- the Collection filter to actually match real line data either way.
-- (An earlier version of this migration deleted these rows as
-- "duplicates" - that broke real Collection-filter matching for
-- Dealer/Rep Reporting and was reverted; see SalesReporting.tsx's
-- collectionGroups for how the UI now dedupes by display_name instead
-- of by raw code, without dropping either code variant.)
UPDATE public.acctivate_collection_codes SET display_name = 'Cape May Driftwood' WHERE code = 'CAPE MAY DRIFTWOOD';
UPDATE public.acctivate_collection_codes SET display_name = 'Credenzas' WHERE code = 'CREDENZAS';
UPDATE public.acctivate_collection_codes SET display_name = 'Manhattan Valley Dark' WHERE code = 'MANHATTAN VALLEY DARK';
UPDATE public.acctivate_collection_codes SET display_name = 'Manhattan Valley Light' WHERE code = 'MANHATTAN VALLEY LIGHT';
UPDATE public.acctivate_collection_codes SET display_name = 'Monaco Blanc' WHERE code = 'MONACO BLANC';
UPDATE public.acctivate_collection_codes SET display_name = 'Monaco Bleu' WHERE code = 'MONACO BLEU';
UPDATE public.acctivate_collection_codes SET display_name = 'Ocean Isles' WHERE code = 'OCEAN ISLES';
UPDATE public.acctivate_collection_codes SET display_name = 'Picket Fence Occassional' WHERE code = 'PICKET FENCE OCCASSIONAL';
UPDATE public.acctivate_collection_codes SET display_name = 'Point Breeze White' WHERE code = 'POINT BREEZE WHITE';
-- These six already had the correct display_name on both code variants
-- (Cabinet Beds, Chatham Maple, Chatham Midnight, Islamorada, Rio Vista,
-- Sun Haven) - nothing to correct, listed here only so this migration's
-- history is a complete record of every pair the dupe-cleanup pass
-- checked.

-- Non-collection Acctivate classes (administrative/charge codes, and
-- the Lamps product line - a real merchandise category but not a
-- furniture "collection") - confirmed directly against Acctivate's own
-- Product Class screen, not guessed. Used to exclude these from the
-- filter dropdowns once real data is synced; has no effect on anything
-- else (no business data touched).
CREATE TABLE IF NOT EXISTS public.acctivate_non_collection_classes (
  acctivate_id text PRIMARY KEY,
  reason text
);
INSERT INTO public.acctivate_non_collection_classes (acctivate_id, reason) VALUES
  ('CCFEE',    'Credit card processing fee'),
  ('CLOSEOUT', 'Closeouts - a status, not a collection'),
  ('COOP',     'Retail co-op marketing'),
  ('CUSTOM',   'Custom/one-off, not a collection'),
  ('DEPOSIT',  'Customer deposit'),
  ('DESIGNDV', 'Design & development'),
  ('DISCO',    'Discount'),
  ('ECOMMALL', 'E-commerce allowance'),
  ('IMPORT',   'Import pass-through / freight'),
  ('MISC',     'Miscellaneous'),
  ('QCFACTOR', 'Quality control - factory'),
  ('QCFREIGH', 'Quality control - freight'),
  ('QCINTERN', 'Quality control - internal'),
  ('RETURN',   'Returns'),
  ('SAMPLE',   'Samples'),
  ('SALESTAX', 'Sales tax'),
  ('SHIP',     'Shipping'),
  ('TARIFF',   'Tariff'),
  ('VTCN',     'Vacation (non-merchandise)'),
  ('LUXCOAST', 'Lamps Coastal - lamps, not a furniture collection'),
  ('LUXTRAD',  'Lamps Traditional - lamps, not a furniture collection'),
  ('LUXTRANS', 'Lamps Transitional - lamps, not a furniture collection')
ON CONFLICT (acctivate_id) DO NOTHING;
-- Plus every TAX-<state> code (TAX-FL, TAX-GA, etc.)
INSERT INTO public.acctivate_non_collection_classes (acctivate_id, reason)
SELECT 'TAX-' || s, 'State sales tax'
FROM unnest(ARRAY['FL','GA','MA','MD','NC','NJ','SC']) s
ON CONFLICT (acctivate_id) DO NOTHING;

REVOKE ALL ON public.acctivate_non_collection_classes FROM anon;
GRANT SELECT ON public.acctivate_non_collection_classes TO authenticated;

-- Rebuilt to prefer the REAL, Acctivate-synced description once a code
-- has landed in acctivate_product_classes; the old hand-typed
-- acctivate_collection_codes is now only a fallback for any code that
-- table hasn't synced yet (e.g. before the very first run with this
-- new query), so nothing breaks in the interim - it silently stops
-- being used, code by code, as real data arrives. "Active" still means
-- "has a currently non-discontinued product in `products`" - the same
-- signal already used everywhere else (Acctivate's own Product Class
-- Active checkbox does not distinguish this - confirmed directly
-- against Acctivate: it's checked for every class, administrative
-- codes included).
CREATE OR REPLACE VIEW public.v_active_acctivate_collection_codes AS
WITH real_synced AS (
  SELECT apc.acctivate_id AS code, apc.description AS display_name, NULL::text AS brand
  FROM public.acctivate_product_classes apc
  WHERE apc.acctivate_id NOT IN (SELECT acctivate_id FROM public.acctivate_non_collection_classes)
    AND apc.description IS NOT NULL AND trim(apc.description) <> ''
),
fallback_unsynced AS (
  SELECT acc.code, acc.display_name, acc.brand
  FROM public.acctivate_collection_codes acc
  WHERE NOT EXISTS (SELECT 1 FROM public.acctivate_product_classes apc WHERE apc.acctivate_id = acc.code)
),
combined AS (
  SELECT * FROM real_synced
  UNION ALL
  SELECT * FROM fallback_unsynced
)
SELECT DISTINCT c.code, c.display_name, c.brand
FROM combined c
WHERE c.display_name IN (
  SELECT DISTINCT c2.display_name
  FROM combined c2
  JOIN public.products p ON upper(trim(p.collection)) = c2.code
  WHERE p.collection IS NOT NULL AND trim(p.collection) <> ''
);

COMMIT;
