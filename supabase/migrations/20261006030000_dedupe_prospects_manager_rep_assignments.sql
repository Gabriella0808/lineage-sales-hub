-- Extends the manager/rep dedup to public.crm_accounts (Prospects), which
-- was explicitly excluded from the original migration (20261006010000).
-- Per explicit instruction: swap the assignment to the correct manager/rep,
-- never delete a prospect. No crm_accounts row is deleted anywhere in this
-- migration - only assigned_manager_id/assigned_rep_id values change, and
-- only the duplicate REP/MANAGER rows themselves (not prospects) are removed.

-- ---------- Mateo (bare) -> Mateo De Lisa ----------
-- dealers/sales_reps already repointed in 20261006010000; this closes the
-- one remaining reference, which was deliberately left alone at the time.
UPDATE public.crm_accounts
  SET assigned_manager_id = 'b291385c-e5db-470c-93d3-9e034361b3d4'
  WHERE assigned_manager_id = '5c2be50c-3144-4d88-8227-1c0af5aa3c94';

-- ---------- Will (bare) -> Will Grisack ----------
UPDATE public.crm_accounts
  SET assigned_manager_id = 'fc3184b3-848c-4921-8770-46127a2821bf'
  WHERE assigned_manager_id = 'dd821573-dce7-4a5c-938d-535927608680';

-- ---------- Arkansas (bare) -> Arkansas (open) ----------
-- Newly found while auditing Prospects: same pattern as Mateo/Will/Robertson
-- (no acctivate_id, same manager as its matched sibling, 0 linked users).
-- Full FK scan done before writing this: only dealers.rep_id (1) and
-- crm_accounts.assigned_rep_id (3) reference it anywhere in the schema.
UPDATE public.dealers
  SET rep_id = '0377c7e2-5782-4b21-8163-d367f7ac8cdd'
  WHERE rep_id = '510bdae3-3290-40d5-b642-c35438f3b1fb';
UPDATE public.crm_accounts
  SET assigned_rep_id = '0377c7e2-5782-4b21-8163-d367f7ac8cdd'
  WHERE assigned_rep_id = '510bdae3-3290-40d5-b642-c35438f3b1fb';
DELETE FROM public.sales_reps WHERE id = '510bdae3-3290-40d5-b642-c35438f3b1fb';

-- ---------- Missouri (open) (bare) -> Missouri, Kansas, Iowa, Nebraska ----------
-- Same pattern/scan as Arkansas above.
UPDATE public.dealers
  SET rep_id = '2a2e3de1-d1e2-4a7b-8f6c-bf751c72c615'
  WHERE rep_id = '2c0d5183-73e6-4321-816b-562772919ba2';
UPDATE public.crm_accounts
  SET assigned_rep_id = '2a2e3de1-d1e2-4a7b-8f6c-bf751c72c615'
  WHERE assigned_rep_id = '2c0d5183-73e6-4321-816b-562772919ba2';
DELETE FROM public.sales_reps WHERE id = '2c0d5183-73e6-4321-816b-562772919ba2';

-- ---------- Jordan Shindell (bare) prospects -> split by state ----------
-- Same state-based rule already applied to this bare record's dealers
-- (20261006010000) and its 2 High Point appointments (20261006020000):
-- DE/NJ -> Shindell- Beach, OH -> Shindell - PA/OH. 5 of these 10 prospects
-- are literally the same companies already resolved at the dealer level
-- (confirms the match). The remaining 4 (no state on file at all: F&S
-- Furniture LLC, Hauser's Furniture, Sleepy Hollow Sleep Shop Co. Inc.,
-- Stylish Toledo LLC) are the exact same 4 companies already left
-- unresolved as dealers for the same reason - stay on the bare record
-- rather than guess.
UPDATE public.crm_accounts
  SET assigned_rep_id = '96ec9def-176e-4d5e-9a0a-2823d59bd9f4' -- Shindell- Beach
  WHERE assigned_rep_id = '321a2b24-fc71-4b8e-a281-da0ec3dceee0'
    AND state IN ('DE', 'NJ');

UPDATE public.crm_accounts
  SET assigned_rep_id = '9d218273-c52d-4103-8695-29b756d3f120' -- Shindell - PA/OH
  WHERE assigned_rep_id = '321a2b24-fc71-4b8e-a281-da0ec3dceee0'
    AND state = 'OH';
