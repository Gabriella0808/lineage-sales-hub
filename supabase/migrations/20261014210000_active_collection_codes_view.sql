-- Single reusable source for "which Acctivate collection codes are real
-- AND currently active" - exactly the question behind every Collection
-- filter in the portal (Dealer/Rep Reporting, Inventory, Backlog), and
-- exactly the same join sync_active_product_collections() already does
-- for Trade Show Leads. One view, one definition, not reimplemented per
-- page - "everywhere in the portal" per the explicit ask.
--
-- "Real" = has a row in acctivate_collection_codes (excludes every
-- administrative/charge code - FREIGHT/MISC/QC*/TAX-*/RETURN/SAMPLE/
-- etc. - since those were never added to that mapping).
-- "Active" = at least one row in `products` currently carries that code
-- (products only ever holds non-discontinued Acctivate products - see
-- Sync-Acctivate.ps1's `products` query's own WHERE clause).

BEGIN;

CREATE OR REPLACE VIEW public.v_active_acctivate_collection_codes AS
SELECT DISTINCT acc.code, acc.display_name, acc.brand
FROM public.acctivate_collection_codes acc
JOIN public.products p ON upper(trim(p.collection)) = acc.code
WHERE p.collection IS NOT NULL AND trim(p.collection) <> '';

REVOKE ALL ON public.v_active_acctivate_collection_codes FROM anon;
GRANT SELECT ON public.v_active_acctivate_collection_codes TO authenticated;

COMMIT;
