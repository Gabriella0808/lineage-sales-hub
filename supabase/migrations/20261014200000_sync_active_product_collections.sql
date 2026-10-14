-- Keep Trade Show Leads' "Collections" picker in sync with Acctivate,
-- instead of the static one-time seed list from 20260428185828 (which is
-- how it went stale: Capri/Island Breeze still listed with zero active
-- products, Sydney - added to Acctivate a few weeks ago - missing
-- entirely, and anyone could freely add anything with no ongoing
-- correction).
--
-- acctivate_collection_codes is a direct port of the EXACT same
-- code -> display-name mapping already hand-maintained in
-- src/components/InvoiceDetailSheet.tsx's COLLECTION_DISPLAY (Dealer/Rep
-- Reporting's "Collection breakdown") - not a new, separately-invented
-- list. Keeping one canonical mapping, now in the database so a sync
-- script can reach it (the frontend map stays too; see this commit's
-- InvoiceDetailSheet.tsx change adding the same missing SYDNEY code
-- there as well, so both sides agree). Deliberately excludes every
-- administrative/charge code already excluded from that same mapping
-- (FREIGHT/MISC/TAX-*/SHIP/RETURN/SAMPLE/DEPOSIT/etc.) - those simply
-- have no row here, so they're never proposed as a "collection."

BEGIN;

CREATE TABLE IF NOT EXISTS public.acctivate_collection_codes (
  code text PRIMARY KEY,
  display_name text NOT NULL,
  brand text,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.acctivate_collection_codes (code, display_name, brand) VALUES
  -- Sea Winds
  ('ISLAMORA', 'Islamorada',   'Sea Winds'),
  ('CREDENZA', 'Credenza',     'Sea Winds'),
  ('SUNHAVEN', 'Sun Haven',    'Sea Winds'),
  ('MONBLANC', 'Monaco',       'Sea Winds'),
  ('MONBLEU',  'Monaco',       'Sea Winds'),
  ('OCEANISL', 'Ocean Isle',   'Sea Winds'),
  ('PICKET',   'Picket Fence', 'Sea Winds'),
  ('SURFSIDE', 'Surfside',     'Sea Winds'),
  ('CMAYDRIF', 'Cape May',     'Sea Winds'),
  ('MIRAMAR',  'Miramar',      'Sea Winds'),
  ('MAUI',     'Maui',         'Sea Winds'),
  ('MONTEREY', 'Monterey',     'Sea Winds'),
  ('CABBED',   'Cabinet Beds', 'Sea Winds'),
  ('SYDNEY',   'Sydney',       'Sea Winds'), -- new, added to Acctivate ~Oct 2026; was missing from every collection list in this portal
  -- Finn & Lou
  ('CHATMAPL', 'Chatham Maple',    'Finn & Lou'),
  ('CHATMIDN', 'Chatham Midnight', 'Finn & Lou'),
  ('GENEVA',   'Geneva',          'Finn & Lou'),
  ('HYDEPARK', 'Hyde Park',       'Finn & Lou'),
  ('MHVDARK',  'MHV Dark',        'Finn & Lou'),
  ('MHVLIGHT', 'MHV Light',       'Finn & Lou'),
  ('PTBREEZE', 'Point Breeze',    'Finn & Lou'),
  ('RIOVISTA', 'Rio Vista',       'Finn & Lou'),
  -- Lux
  ('LUXCOAST', 'Lux Coast',         'Lux'),
  ('LUXTRANS', 'Lux Transitional',  'Lux'),
  ('LUXTRAD',  'Lux Traditional',   'Lux')
ON CONFLICT (code) DO UPDATE SET display_name = EXCLUDED.display_name, brand = EXCLUDED.brand;

REVOKE ALL ON public.acctivate_collection_codes FROM anon;
GRANT SELECT ON public.acctivate_collection_codes TO authenticated;

-- "is reasonable": mark, never hard-delete (product_collections has no FK
-- from leads data - Capture Leads stores a free-text comma-joined string,
-- not an id - so there's no integrity reason to delete; a soft flag is
-- reversible if a collection comes back, and matches this project's own
-- established pattern of marking things inactive rather than deleting -
-- e.g. products.is_active).
ALTER TABLE public.product_collections ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Re-derives which collections are "active" purely from what's actually
-- in the products table right now (synced by Sync-Acctivate.ps1's
-- `products` query, which already only pulls non-discontinued Acctivate
-- products - see that script's `WHERE ISNULL(p.Discontinued, 0) = 0` -
-- so "has at least one active product today" is exactly the Acctivate
-- "active" signal, with no separate class-level flag to sync).
--
-- Explicit product decision (2026-10-14): a collection is active if and
-- only if it's currently backed by an Acctivate product class in
-- acctivate_collection_codes with at least one product. Everything
-- else - including names that were only ever manually typed into the
-- picker, never an Acctivate class (the original 2026-04-28 seed list's
-- "Harbor View," "Mixed Container," "New Credenza," the un-finished
-- "Credenzas"/"Ocean Isles" variants now superseded by "Credenza"/
-- "Ocean Isle," etc.) - gets deactivated, not just names that used to
-- map to Acctivate and lost their products. This also means a
-- rep-typed custom addition will be deactivated on the NEXT sync run
-- unless it happens to match a real Acctivate collection name.
--
-- SECURITY DEFINER + no EXECUTE grant to authenticated/anon: this is
-- only ever called from the sync-acctivate Edge Function, which runs
-- with the service role.
CREATE OR REPLACE FUNCTION public.sync_active_product_collections()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted int := 0;
  v_activated int := 0;
  v_deactivated int := 0;
BEGIN
  WITH active_names AS (
    SELECT DISTINCT acc.display_name
    FROM public.products p
    JOIN public.acctivate_collection_codes acc ON acc.code = upper(trim(p.collection))
    WHERE p.collection IS NOT NULL AND trim(p.collection) <> ''
  ),
  upserted AS (
    INSERT INTO public.product_collections (name, is_active)
    SELECT display_name, true FROM active_names
    ON CONFLICT (name) DO UPDATE SET is_active = true
    RETURNING (xmax = 0) AS was_insert -- true only for a brand-new row
  ),
  deactivated AS (
    UPDATE public.product_collections pc
    SET is_active = false
    WHERE pc.is_active = true
      AND pc.name NOT IN (SELECT display_name FROM active_names)
    RETURNING 1
  )
  SELECT
    (SELECT count(*) FILTER (WHERE was_insert) FROM upserted),
    (SELECT count(*) FILTER (WHERE NOT was_insert) FROM upserted),
    (SELECT count(*) FROM deactivated)
  INTO v_inserted, v_activated, v_deactivated;

  RETURN jsonb_build_object(
    'inserted', v_inserted, 'activated', v_activated, 'deactivated', v_deactivated,
    'synced_at', now()
  );
END;
$function$;

COMMIT;
