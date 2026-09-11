-- ══════════════════════════════════════════════════════════════════════════════
-- Reconcile unmatched-dealer revenue, batch 1 (24 of 26 diagnosed rows).
--
-- Diagnosed via the exact roster-exclusion logic get_sales_reporting_
-- grouped_rows uses, against v_portal_dealer_rep_reporting_lines with a
-- non-null customer_id: 26 distinct customer_ids with real bookings/
-- invoiced revenue ($153,231.90 total) currently fall into "Unmatched /
-- Unassigned Dealer" instead of their own dealer row. This migration
-- fixes the 24 that are unambiguous (no collision, clear identity, no
-- material rep/manager gap) - the exact same pattern already proven for
-- Kloss Furniture (20260913002600).
--
-- Left OUT of this batch, still in Unmatched, on purpose:
--   - Boston Interiors Home Furnishings LLC ('BOSTONINT'), $3,350.40 -
--     zero rep attribution on every line; even creating the dealer row
--     would still fail the roster's salesperson-or-territory gate
--     without a human assigning one.
--   - Marketplace on Elm ('Set Up - Marketplace on Elm'), -$250.80 - a
--     single negative-only line with no corresponding positive sale
--     ever recorded under this identity; looks like a credit/adjustment,
--     not confidently a standalone dealer.
--   - Any bookings/invoiced lines with a NULL/blank customer_id entirely
--     (already excluded from this diagnosis - genuinely unidentifiable,
--     nothing to match against).
--
-- No alias/mapping table used: every one of these 24 is either a direct
-- UPDATE to an existing dealer row (acctivate_id already confirmed to
-- collide with nothing) or a plain INSERT with zero name/acctivate_id
-- collision (verified against the full dealers table before writing
-- this migration) - Category C (duplicate/needs-merge) doesn't apply to
-- any row in this batch.
--
-- Group A - SAFE UPDATE EXISTING (4): acctivate_id corrected to match
-- the real bookings customer_id; salesperson populated from the
-- transaction's own rep attribution (satisfies the roster's
-- salesperson-OR-territory gate); rep_id populated only where currently
-- null; manager_id preserved where already set, populated only where
-- null and safely derivable from the rep's own manager.
--
-- Group B - SAFE CREATE NEW (20): new dealers.rep created with
-- acctivate_id = the literal transaction customer_id (several carry
-- Acctivate's "Set Up - " prefix - kept verbatim, not cleaned, since
-- future bookings will keep arriving under that same literal value
-- until Acctivate itself finalizes the customer record), display name
-- = the clean dealer_name from the transaction, salesperson/rep_id/
-- manager_id derived from the transaction's own rep attribution via
-- sales_reps. Gill Brothers Furniture's rep code ("Jones") does not
-- resolve to any current sales_reps row - salesperson is set to that
-- raw value (already present in the real transaction data, not
-- invented) so the roster gate is satisfied, but rep_id/manager_id are
-- left null rather than guessing. territory is never invented anywhere
-- in this migration.
--
-- Nothing about bookings/invoiced formulas, Live KPI, Open SO, Labor
-- Day Promo, sync scripts, Prospect Reporting, or any source
-- transaction row is touched - this is public.dealers roster data only.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Group A: update existing dealer rows ────────────────────────────────

UPDATE public.dealers
SET acctivate_id = 'Suburban Furniture',
    salesperson  = 'Peter Avella',
    rep_id       = '529ef65f-6d86-4287-b22f-c09508b84bcd'
WHERE id = 'cfe5cb9f-694a-429a-bf1d-0ab5aafc209c' AND name = 'SUBURBAN FURNITURE';

UPDATE public.dealers
SET acctivate_id = 'Create More Space',
    salesperson  = 'Mike Durham',
    rep_id       = '2f391e20-2e88-4f91-b992-9176775afdf3'
WHERE id = 'c3dc40c9-8937-4f7c-a89d-903e751cfd93' AND name = 'CREATE MORE SPACE';

UPDATE public.dealers
SET acctivate_id = 'Shoreside Furnishings',
    salesperson  = 'Brent Holbrook',
    rep_id       = '371d3f7b-1dda-4d5e-a8c9-7ab85f4a4bf1'
WHERE id = 'f0316534-0a53-4c0c-8f00-5c4f8bc52464' AND name = 'Shoreside Furnishings';

UPDATE public.dealers
SET acctivate_id = 'Ashleys on Main',
    salesperson  = 'Dave Ervin',
    rep_id       = 'dbd0d7e3-5dd3-467f-8536-85bc890980ea',
    manager_id   = COALESCE(manager_id, 'b291385c-e5db-470c-93d3-9e034361b3d4')
WHERE id = 'bd6deb8a-d197-44e6-98d1-fa89a10c0bc4' AND name = 'Ashleys on Main';

-- ── Group B: create new dealer rows ─────────────────────────────────────

INSERT INTO public.dealers (name, acctivate_id, salesperson, rep_id, manager_id, source) VALUES
  ('Deets Furniture Inc',                  'Deets Furniture Inc',                  'House',                        '5ced43be-d9ea-43a3-aa4f-c9c923d42a4d', 'b09a100d-4ea4-42b2-bcbf-97f1f4538310', 'acctivate'),
  ('Gill Brothers Furniture',              'Set Up - Gill Brothers Furniture',     'Jones',                        NULL,                                    NULL,                                    'acctivate'),
  ('Wilford and Lee Home Accents',         'Wilford and Lee Home Accents',         'Brent Holbrook',               '371d3f7b-1dda-4d5e-a8c9-7ab85f4a4bf1', 'fc3184b3-848c-4921-8770-46127a2821bf', 'acctivate'),
  ('Manifest Design Corp.',                'Manifest Design Corp.',                'Dave Ervin',                   'dbd0d7e3-5dd3-467f-8536-85bc890980ea', 'b291385c-e5db-470c-93d3-9e034361b3d4', 'acctivate'),
  ('Beach Cove Resort Inc',                'Beach Cove Resort Inc',                'Dave Ervin',                   'dbd0d7e3-5dd3-467f-8536-85bc890980ea', 'b291385c-e5db-470c-93d3-9e034361b3d4', 'acctivate'),
  ('Weinberger''s Furniture',              'Set Up - Weinberger''s Furniture',     'Bruce Quillen',                '3283920d-1a6a-411f-a089-26beb35734c9', 'fc3184b3-848c-4921-8770-46127a2821bf', 'acctivate'),
  ('Rex & Rex',                            'Set Up - Rex & Rex',                   'Brent Holbrook',               '371d3f7b-1dda-4d5e-a8c9-7ab85f4a4bf1', 'fc3184b3-848c-4921-8770-46127a2821bf', 'acctivate'),
  ('Sprintz Furniture Showroom',           'Sprintz Furniture Showroom',           'Doug Brown and Gavin Dietz',   'a3acbf57-bd12-40a1-9901-79b1dd16137b', 'fc3184b3-848c-4921-8770-46127a2821bf', 'acctivate'),
  ('Furniture Decor Showrooms',            'Furniture Decor Showrooms',            'Skip Camillo',                 '841768dd-54a2-425d-ae31-48c45813705e', 'fc963263-b0c1-41f0-bfbd-a1488f08f0fc', 'acctivate'),
  ('Powell''s Furniture and Mattress',     'Powell''s Furniture Inc',              'Brad Robertson',               '7a98ca2c-c6aa-4541-b680-cbc5485f3cc3', 'b291385c-e5db-470c-93d3-9e034361b3d4', 'acctivate'),
  ('Peaches To Beaches',                   'Peaches To Beaches',                   'Bruce Quillen',                '3283920d-1a6a-411f-a089-26beb35734c9', 'fc3184b3-848c-4921-8770-46127a2821bf', 'acctivate'),
  ('Braden''s Wholesale Furniture Co, Inc','Braden''s Wholesale Furniture Co, Inc','Doug Brown and Gavin Dietz',   'a3acbf57-bd12-40a1-9901-79b1dd16137b', 'fc3184b3-848c-4921-8770-46127a2821bf', 'acctivate'),
  ('The Special Touch',                    'Set Up - The Special Touch',           'House',                        '5ced43be-d9ea-43a3-aa4f-c9c923d42a4d', 'b09a100d-4ea4-42b2-bcbf-97f1f4538310', 'acctivate'),
  ('Rustic Elegance, LLC',                 'Rustic Elegance',                      'Stewart Hunt',                 'a4efc6b7-09cb-4f70-a314-b5b2bf71beaa', 'fc3184b3-848c-4921-8770-46127a2821bf', 'acctivate'),
  ('Endless Creations',                    'Endless Creations',                    'Dave Ervin',                   'dbd0d7e3-5dd3-467f-8536-85bc890980ea', 'b291385c-e5db-470c-93d3-9e034361b3d4', 'acctivate'),
  ('Amish & Sofa City Outlet',             'Amish & Sofa City Outlet',             'Dave Ervin',                   'dbd0d7e3-5dd3-467f-8536-85bc890980ea', 'b291385c-e5db-470c-93d3-9e034361b3d4', 'acctivate'),
  ('Murphy Bed Center of Daytona',         'Murphy Bed Center of Daytona',         'Mike Durham',                  '2f391e20-2e88-4f91-b992-9176775afdf3', 'fc3184b3-848c-4921-8770-46127a2821bf', 'acctivate'),
  ('Ocean Gardens and Gifts',              'Ocean Gardens and Gifts',              'Brent Holbrook',               '371d3f7b-1dda-4d5e-a8c9-7ab85f4a4bf1', 'fc3184b3-848c-4921-8770-46127a2821bf', 'acctivate'),
  ('The Source Furnishings',               'The Source Furnishings',               'Dave Ervin',                   'dbd0d7e3-5dd3-467f-8536-85bc890980ea', 'b291385c-e5db-470c-93d3-9e034361b3d4', 'acctivate'),
  ('Magnolia & Pine',                      'Set Up - Magnolia Pine',               'Bruce Quillen',                '3283920d-1a6a-411f-a089-26beb35734c9', 'fc3184b3-848c-4921-8770-46127a2821bf', 'acctivate')
ON CONFLICT (acctivate_id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- A. Unmatched bucket (bookings, 2026-01-01..2026-09-11) should drop by
--    ~$143,393.30 (the safe-batch total, excluding the two flagged rows):
--    SELECT entity_key, primary_amt FROM get_sales_reporting_grouped_rows(
--      p_group_by:='dealer', p_metric:='bookings', p_from:='2026-01-01',
--      p_to:='2026-09-11', p_customer_ids:=NULL, p_brand_cats:=NULL,
--      p_skus:=NULL, p_rep_ids:=NULL, p_manager_id:=NULL)
--    WHERE entity_key = 'UNASSIGNED_DEALER';
--
-- B. Dealer Reporting grand total unchanged:
--    SELECT round(sum(primary_amt)::numeric,2) FROM get_sales_reporting_grouped_rows(
--      p_group_by:='dealer', p_metric:='bookings', p_from:='2026-01-01',
--      p_to:='2026-09-11', p_customer_ids:=NULL, p_brand_cats:=NULL,
--      p_skus:=NULL, p_rep_ids:=NULL, p_manager_id:=NULL);
--    -- expect 4798371.49, same as before this migration
--
-- C. Each fixed dealer now shows as its own row with the expected amount.
--
-- D. No duplicate active dealer rows for the same normalized acctivate_id.
-- ══════════════════════════════════════════════════════════════════════════════
