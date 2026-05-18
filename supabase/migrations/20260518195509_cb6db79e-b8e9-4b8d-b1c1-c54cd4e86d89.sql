-- 1. Add the two new text columns
ALTER TABLE public.dealers
  ADD COLUMN IF NOT EXISTS salesperson text,
  ADD COLUMN IF NOT EXISTS territory   text;

CREATE INDEX IF NOT EXISTS idx_dealers_salesperson ON public.dealers (salesperson);
CREATE INDEX IF NOT EXISTS idx_dealers_territory_text ON public.dealers (territory);

-- 2. Resolver trigger function
CREATE OR REPLACE FUNCTION public.resolve_dealer_acctivate_links()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  rep_name_clean text;
  matched_rep_id uuid;
  matched_territory_id uuid;
  new_territory_id uuid;
BEGIN
  -- ---- Salesperson -> rep_id ----
  IF NEW.salesperson IS NOT NULL AND length(trim(NEW.salesperson)) > 0 THEN
    -- Strip trailing " (XX)" code suffix, e.g. "Mike Durham (MD)" -> "Mike Durham"
    rep_name_clean := trim(regexp_replace(NEW.salesperson, '\s*\([^)]*\)\s*$', ''));

    SELECT id INTO matched_rep_id
    FROM public.sales_reps
    WHERE lower(name) = lower(rep_name_clean)
    LIMIT 1;

    IF matched_rep_id IS NOT NULL THEN
      NEW.rep_id := matched_rep_id;
    END IF;
  END IF;

  -- ---- Territory -> territory_id (auto-create if missing) ----
  IF NEW.territory IS NOT NULL AND length(trim(NEW.territory)) > 0 THEN
    SELECT id INTO matched_territory_id
    FROM public.territories
    WHERE lower(name) = lower(trim(NEW.territory))
    LIMIT 1;

    IF matched_territory_id IS NULL THEN
      INSERT INTO public.territories (name)
      VALUES (trim(NEW.territory))
      RETURNING id INTO new_territory_id;
      NEW.territory_id := new_territory_id;
    ELSE
      NEW.territory_id := matched_territory_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Trigger fires only when relevant text changes (or on insert)
DROP TRIGGER IF EXISTS trg_resolve_dealer_acctivate_links ON public.dealers;
CREATE TRIGGER trg_resolve_dealer_acctivate_links
BEFORE INSERT OR UPDATE OF salesperson, territory ON public.dealers
FOR EACH ROW
EXECUTE FUNCTION public.resolve_dealer_acctivate_links();

-- 4. Backfill the new text columns from existing FK links so the round-trip works
UPDATE public.dealers d
SET salesperson = sr.name
FROM public.sales_reps sr
WHERE d.rep_id = sr.id
  AND d.salesperson IS NULL;

UPDATE public.dealers d
SET territory = t.name
FROM public.territories t
WHERE d.territory_id = t.id
  AND d.territory IS NULL;