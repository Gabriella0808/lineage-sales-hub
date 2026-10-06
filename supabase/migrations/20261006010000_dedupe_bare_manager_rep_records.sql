-- PART 0: fix 5 open-territory placeholder sales_reps rows whose acctivate_id
-- didn't actually match Acctivate's real salesperson code (blank, or wrong
-- text like 'Arkansas' instead of the real code 'AR'). Needed so the
-- Acctivate-name join used by Capture Leads and other FK-requiring pickers
-- can resolve these. Narrow, additive text fix only - no merge, no FK
-- repointing, no deletion.
UPDATE public.sales_reps SET acctivate_id = 'Accom' WHERE id = 'd89cc3e3-d026-4420-a8ff-16d5ce805d7f'; -- Accomodation
UPDATE public.sales_reps SET acctivate_id = 'AR'    WHERE id = '0377c7e2-5782-4b21-8163-d367f7ac8cdd'; -- Arkansas (open)
UPDATE public.sales_reps SET acctivate_id = 'Ochs'  WHERE id = '04b58e62-7a58-4e7b-810b-0cd85b7f3618'; -- Illinois, Wisconsin, Minnesota and Dakotas
UPDATE public.sales_reps SET acctivate_id = 'Indy'  WHERE id = '507a2f75-4751-43e2-8468-76ab07415cec'; -- Indiana
UPDATE public.sales_reps SET acctivate_id = 'JKest' WHERE id = '2a2e3de1-d1e2-4a7b-8f6c-bf751c72c615'; -- Missouri, Kansas, Iowa, Nebraska

-- PART 1: dedupe bare manager/rep records that shadow a real Acctivate-
-- labeled sibling for the same person, everywhere in the portal EXCEPT
-- Field Check-Ins (dealer_check_ins stores only user_id, never touched by
-- this migration at all) and Prospects (public.crm_accounts, deliberately
-- left alone per explicit instruction).

-- Mateo (bare, 5c2be50c) -> Mateo De Lisa (b291385c). crm_accounts
-- (Prospects) intentionally NOT touched, so the bare row stays in place
-- (still FK-referenced there) but is no longer used anywhere else.
UPDATE public.dealers    SET manager_id = 'b291385c-e5db-470c-93d3-9e034361b3d4' WHERE manager_id = '5c2be50c-3144-4d88-8227-1c0af5aa3c94';
UPDATE public.sales_reps SET manager_id = 'b291385c-e5db-470c-93d3-9e034361b3d4' WHERE manager_id = '5c2be50c-3144-4d88-8227-1c0af5aa3c94';

-- Will (bare, dd821573) -> Will Grisack (fc3184b3). Same crm_accounts exclusion.
UPDATE public.dealers    SET manager_id = 'fc3184b3-848c-4921-8770-46127a2821bf' WHERE manager_id = 'dd821573-dce7-4a5c-938d-535927608680';
UPDATE public.sales_reps SET manager_id = 'fc3184b3-848c-4921-8770-46127a2821bf' WHERE manager_id = 'dd821573-dce7-4a5c-938d-535927608680';

-- Robertson (bare, 0f99387f) -> Brad Robertson (7a98ca2c). No Prospects
-- dependency found (crm_accounts.assigned_rep_id had 0 rows on this id) -
-- fully merge and delete. The one portal user linked to bare "Robertson" is
-- already separately linked to the real Brad Robertson record.
UPDATE public.dealers SET rep_id = '7a98ca2c-c6aa-4541-b680-cbc5485f3cc3' WHERE rep_id = '0f99387f-c6fa-4d3e-a736-09454fe0521c';
DELETE FROM public.user_reps WHERE rep_id = '0f99387f-c6fa-4d3e-a736-09454fe0521c';
DELETE FROM public.sales_reps WHERE id = '0f99387f-c6fa-4d3e-a736-09454fe0521c';

-- Fully orphaned legacy rows ("Jones", "Alex Beyer") - zero dependents in
-- any FK-referencing table in the schema (full scan done before writing
-- this migration). Safe to remove outright.
DELETE FROM public.sales_reps WHERE id IN ('c99ed46f-a3ce-4588-930a-039187d9d5d6', '090c30c0-e4b1-40af-844a-71f553c70796');

-- Jordan Shindell (bare, 321a2b24, 53 dealers, 0 user links) -> split between
-- the two real, legitimate territory-coded siblings (both confirmed by the
-- user to genuinely belong to him) by each dealer's own territory text.
-- 49 of 53 have a clear signal; the remaining 4 are field_only dealers with
-- no Acctivate match at all (no acctivate_id), so there is no Acctivate
-- source to resolve them against - they stay on the bare record, which is
-- why that record isn't deleted here.
UPDATE public.dealers SET rep_id = '96ec9def-176e-4d5e-9a0a-2823d59bd9f4' -- Shindell- Beach (Shin)
  WHERE rep_id = '321a2b24-fc71-4b8e-a281-da0ec3dceee0'
    AND (territory = 'Mid Atlantic' OR (territory IS NULL AND state IN ('NJ','DE')));

UPDATE public.dealers SET rep_id = '9d218273-c52d-4103-8695-29b756d3f120' -- Shindell - PA/OH (Shin2)
  WHERE rep_id = '321a2b24-fc71-4b8e-a281-da0ec3dceee0'
    AND territory IN ('Ohio','PA West');
