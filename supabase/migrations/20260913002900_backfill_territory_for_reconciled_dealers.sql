-- ══════════════════════════════════════════════════════════════════════════════
-- Backfill territory for the 24 dealers fixed/created in 20260913002600
-- (Kloss) and 20260913002700 (unmatched-dealer reconciliation batch 1),
-- where safely derivable from the existing rep -> territory mapping
-- (public.rep_territories).
--
-- Rule applied: derive territory ONLY when the dealer's assigned rep maps
-- to EXACTLY ONE territory in rep_territories. Several reps cover more
-- than one territory (Doug Brown and Gavin Dietz: Tennessee + MS-LA; Skip
-- Camillo: New England + "Skip Camillo"), and one rep code on the
-- transaction data ("Jones", Gill Brothers Furniture's rep) does not
-- resolve to any sales_reps row at all - for all of those, guessing which
-- territory would be inventing data, so they are left Unassigned per
-- explicit instruction.
--
-- 20 of 24 dealers get a safely-derived territory; 4 stay Unassigned:
--   Gill Brothers Furniture   - rep "Jones" does not resolve to any rep
--   Sprintz Furniture Showroom - rep has 2 territories (Tennessee, MS-LA)
--   Furniture Decor Showrooms  - rep has 2 territories (New England, Skip Camillo)
--   Braden's Wholesale Furniture Co, Inc - same rep as Sprintz, same issue
--
-- Both dealers.territory (text) and dealers.territory_id (FK) are set
-- together, matching the existing convention (confirmed via query: these
-- two columns are populated in lockstep on every other dealer row today).
--
-- Nothing about bookings/invoiced formulas, Live KPI, Rep Reporting
-- totals, Open SO, Labor Day Promo, sync scripts, or source transaction
-- data is touched - dealers.territory/territory_id only.
-- ══════════════════════════════════════════════════════════════════════════════

-- Kloss Furniture — rep House -> territory "House" (single, unambiguous mapping)
UPDATE public.dealers
SET territory = 'House', territory_id = '7648cba4-89dc-4464-b794-6182e9baf470'
WHERE acctivate_id = 'Kloss Furniture';

-- Group A (batch 1 updates)
UPDATE public.dealers SET territory = 'NY/NJ',       territory_id = 'e367c68a-ccfd-4919-8e40-9da53b44a541' WHERE acctivate_id = 'Suburban Furniture';
UPDATE public.dealers SET territory = 'North Florida', territory_id = 'a6cfc028-80b0-4160-9f96-e51b6c3f0497' WHERE acctivate_id = 'Create More Space';
UPDATE public.dealers SET territory = 'South Florida', territory_id = '15d6e69f-74cb-48f3-a6b4-fe91bb19adbd' WHERE acctivate_id = 'Shoreside Furnishings';
UPDATE public.dealers SET territory = 'NC/SC',        territory_id = '870a3f0f-0308-4282-a6e9-838b00559516' WHERE acctivate_id = 'Ashleys on Main';

-- Group B (batch 1 creates) — 16 of 20 safely derivable
UPDATE public.dealers SET territory = 'House',            territory_id = '7648cba4-89dc-4464-b794-6182e9baf470' WHERE acctivate_id = 'Deets Furniture Inc';
UPDATE public.dealers SET territory = 'South Florida',     territory_id = '15d6e69f-74cb-48f3-a6b4-fe91bb19adbd' WHERE acctivate_id = 'Wilford and Lee Home Accents';
UPDATE public.dealers SET territory = 'NC/SC',             territory_id = '870a3f0f-0308-4282-a6e9-838b00559516' WHERE acctivate_id = 'Manifest Design Corp.';
UPDATE public.dealers SET territory = 'NC/SC',             territory_id = '870a3f0f-0308-4282-a6e9-838b00559516' WHERE acctivate_id = 'Beach Cove Resort Inc';
UPDATE public.dealers SET territory = 'Panhandle/GA/AL',   territory_id = '1aa8acfb-11eb-4e8c-9d77-fc2a5f29db42' WHERE acctivate_id = 'Set Up - Weinberger''s Furniture';
UPDATE public.dealers SET territory = 'South Florida',     territory_id = '15d6e69f-74cb-48f3-a6b4-fe91bb19adbd' WHERE acctivate_id = 'Set Up - Rex & Rex';
UPDATE public.dealers SET territory = 'VA/WV',             territory_id = '873d84ef-82a0-4141-babe-fd362aabf6da' WHERE acctivate_id = 'Powell''s Furniture Inc';
UPDATE public.dealers SET territory = 'Panhandle/GA/AL',   territory_id = '1aa8acfb-11eb-4e8c-9d77-fc2a5f29db42' WHERE acctivate_id = 'Peaches To Beaches';
UPDATE public.dealers SET territory = 'House',             territory_id = '7648cba4-89dc-4464-b794-6182e9baf470' WHERE acctivate_id = 'Set Up - The Special Touch';
UPDATE public.dealers SET territory = 'TX/OK',             territory_id = '2bbf2341-d6fa-4105-9d76-ab0eebc7c3f8' WHERE acctivate_id = 'Rustic Elegance';
UPDATE public.dealers SET territory = 'NC/SC',             territory_id = '870a3f0f-0308-4282-a6e9-838b00559516' WHERE acctivate_id = 'Endless Creations';
UPDATE public.dealers SET territory = 'NC/SC',             territory_id = '870a3f0f-0308-4282-a6e9-838b00559516' WHERE acctivate_id = 'Amish & Sofa City Outlet';
UPDATE public.dealers SET territory = 'North Florida',     territory_id = 'a6cfc028-80b0-4160-9f96-e51b6c3f0497' WHERE acctivate_id = 'Murphy Bed Center of Daytona';
UPDATE public.dealers SET territory = 'South Florida',     territory_id = '15d6e69f-74cb-48f3-a6b4-fe91bb19adbd' WHERE acctivate_id = 'Ocean Gardens and Gifts';
UPDATE public.dealers SET territory = 'NC/SC',             territory_id = '870a3f0f-0308-4282-a6e9-838b00559516' WHERE acctivate_id = 'The Source Furnishings';
UPDATE public.dealers SET territory = 'Panhandle/GA/AL',   territory_id = '1aa8acfb-11eb-4e8c-9d77-fc2a5f29db42' WHERE acctivate_id = 'Set Up - Magnolia Pine';

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- SELECT name, acctivate_id, territory, territory_id FROM dealers
-- WHERE acctivate_id IN (
--   'Kloss Furniture','Suburban Furniture','Create More Space','Shoreside Furnishings',
--   'Ashleys on Main','Deets Furniture Inc','Wilford and Lee Home Accents',
--   'Manifest Design Corp.','Beach Cove Resort Inc',
--   'Set Up - Weinberger''s Furniture','Set Up - Rex & Rex',
--   'Powell''s Furniture Inc','Peaches To Beaches','Set Up - The Special Touch',
--   'Rustic Elegance','Endless Creations','Amish & Sofa City Outlet',
--   'Murphy Bed Center of Daytona','Ocean Gardens and Gifts','The Source Furnishings',
--   'Set Up - Magnolia Pine'
-- ) ORDER BY name;
-- -- expect all 21 rows with territory populated
--
-- Confirm the 4 intentionally-unresolved dealers remain Unassigned:
-- SELECT name, territory FROM dealers WHERE acctivate_id IN (
--   'Set Up - Gill Brothers Furniture', 'Sprintz Furniture Showroom',
--   'Furniture Decor Showrooms', 'Braden''s Wholesale Furniture Co, Inc'
-- );
-- -- expect territory IS NULL for all 4
-- ══════════════════════════════════════════════════════════════════════════════
