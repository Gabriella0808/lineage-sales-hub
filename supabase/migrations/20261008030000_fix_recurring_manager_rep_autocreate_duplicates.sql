-- Found while investigating "why are there duplicate managers in Prospects
-- again" (Oct 8): resolve_dealer_acctivate_links() (the trigger that keeps
-- dealers.rep_id/manager_id/territory_id in sync with their raw salesperson/
-- sales_manager/territory text on every Acctivate sync) silently recreated
-- bare "Mateo"/"Will" manager rows at 06:00 today - new ids, zero email,
-- same signature as the ones merged in 20261006010000/20261006040000. Its
-- matching logic (exact, then prefix-of-full-name) is itself sound and
-- matches correctly when tested directly against live data right now - the
-- auto-CREATE fallback is the real risk, not the matching, since any gap
-- in matching (timing, batching, a future edge case) silently manufactures
-- a brand new near-duplicate person instead of just leaving the link blank.
--
-- Real, durable fix: this trigger should never again create a new
-- managers/sales_reps row on its own. It still fully links to an EXISTING
-- row the same way as before (exact match, then prefix-of-full-name
-- fallback) - only the INSERT-when-no-match branch is removed, for both
-- the rep and manager halves. A dealer whose salesperson/sales_manager text
-- doesn't match any existing roster entry just gets a null rep_id/manager_id
-- instead of manufacturing a new "person" - its raw salesperson/
-- sales_manager text columns are already what Dealer/Rep Reporting actually
-- displays (per 20261006010000), so nothing is lost there. Territory
-- auto-create is untouched - a genuinely new territory name is a normal,
-- expected thing to add, unlike a person who should already be enrolled.

-- ---------- Part 1: re-merge the 2 new bare duplicates (not delete any dealer/rep/prospect, only repoint) ----------
UPDATE public.dealers    SET manager_id = 'b291385c-e5db-470c-93d3-9e034361b3d4' WHERE manager_id = '4cf80395-05a1-411a-b913-c3f0c88fa069'; -- Mateo (bare, new) -> Mateo De Lisa
UPDATE public.sales_reps SET manager_id = 'b291385c-e5db-470c-93d3-9e034361b3d4' WHERE manager_id = '4cf80395-05a1-411a-b913-c3f0c88fa069';
UPDATE public.dealers    SET manager_id = 'fc3184b3-848c-4921-8770-46127a2821bf' WHERE manager_id = 'c9de6aaa-17b9-4138-af72-cc789f76969e'; -- Will (bare, new) -> Will Grisack
UPDATE public.sales_reps SET manager_id = 'fc3184b3-848c-4921-8770-46127a2821bf' WHERE manager_id = 'c9de6aaa-17b9-4138-af72-cc789f76969e';

DELETE FROM public.managers WHERE id IN (
  '4cf80395-05a1-411a-b913-c3f0c88fa069', -- "Mateo" (bare, new)
  'c9de6aaa-17b9-4138-af72-cc789f76969e'  -- "Will" (bare, new)
);

-- ---------- Part 2: stop the trigger from ever auto-creating a new manager/rep row ----------
CREATE OR REPLACE FUNCTION public.resolve_dealer_acctivate_links()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  rep_name_clean text;
  mgr_name_clean text;
  matched_rep_id uuid;
  matched_territory_id uuid;
  matched_manager_id uuid;
  new_territory_id uuid;
BEGIN
  -- Salesperson -> rep_id (link to an existing rep only - never create one)
  IF NEW.salesperson IS NOT NULL AND length(trim(NEW.salesperson)) > 0 THEN
    rep_name_clean := trim(regexp_replace(NEW.salesperson, '\s*\([^)]*\)\s*$', ''));
    SELECT id INTO matched_rep_id
    FROM public.sales_reps
    WHERE lower(name) = lower(rep_name_clean)
    LIMIT 1;
    IF matched_rep_id IS NULL THEN
      SELECT id INTO matched_rep_id
      FROM public.sales_reps
      WHERE lower(name) LIKE lower(rep_name_clean) || ' %'
      ORDER BY length(name)
      LIMIT 1;
    END IF;
    NEW.rep_id := matched_rep_id; -- null if no match - not auto-created
  END IF;

  -- Territory -> territory_id (auto-create if missing - unchanged, a new
  -- territory name is a normal thing to add, not a duplicate-person risk)
  IF NEW.territory IS NOT NULL AND length(trim(NEW.territory)) > 0 THEN
    SELECT id INTO matched_territory_id
    FROM public.territories
    WHERE lower(name) = lower(trim(NEW.territory))
    LIMIT 1;
    IF matched_territory_id IS NULL THEN
      INSERT INTO public.territories (name) VALUES (trim(NEW.territory))
      RETURNING id INTO new_territory_id;
      NEW.territory_id := new_territory_id;
    ELSE
      NEW.territory_id := matched_territory_id;
    END IF;
  END IF;

  -- Sales Manager -> manager_id (link to an existing manager only - never create one)
  IF NEW.sales_manager IS NOT NULL AND length(trim(NEW.sales_manager)) > 0 THEN
    mgr_name_clean := trim(regexp_replace(NEW.sales_manager, '\s*\([^)]*\)\s*$', ''));
    SELECT id INTO matched_manager_id
    FROM public.managers
    WHERE lower(name) = lower(mgr_name_clean)
    LIMIT 1;
    IF matched_manager_id IS NULL THEN
      SELECT id INTO matched_manager_id
      FROM public.managers
      WHERE lower(name) LIKE lower(mgr_name_clean) || ' %'
      ORDER BY length(name)
      LIMIT 1;
    END IF;
    NEW.manager_id := matched_manager_id; -- null if no match - not auto-created
  END IF;

  -- Keep sales_reps.manager_id in sync when we know both
  IF NEW.rep_id IS NOT NULL AND NEW.manager_id IS NOT NULL THEN
    UPDATE public.sales_reps
    SET manager_id = NEW.manager_id
    WHERE id = NEW.rep_id
      AND (manager_id IS DISTINCT FROM NEW.manager_id);
  END IF;

  RETURN NEW;
END;
$function$;
