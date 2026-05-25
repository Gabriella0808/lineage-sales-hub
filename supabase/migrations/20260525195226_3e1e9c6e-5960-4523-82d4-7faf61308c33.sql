-- 1) Upgrade resolve_dealer_acctivate_links to auto-create missing reps and managers
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
  new_rep_id uuid;
  new_manager_id uuid;
BEGIN
  -- Salesperson -> rep_id (auto-create if missing)
  IF NEW.salesperson IS NOT NULL AND length(trim(NEW.salesperson)) > 0 THEN
    rep_name_clean := trim(regexp_replace(NEW.salesperson, '\s*\([^)]*\)\s*$', ''));
    SELECT id INTO matched_rep_id
    FROM public.sales_reps
    WHERE lower(name) = lower(rep_name_clean)
    LIMIT 1;
    IF matched_rep_id IS NULL THEN
      INSERT INTO public.sales_reps (name) VALUES (rep_name_clean)
      RETURNING id INTO new_rep_id;
      NEW.rep_id := new_rep_id;
    ELSE
      NEW.rep_id := matched_rep_id;
    END IF;
  END IF;

  -- Territory -> territory_id (auto-create if missing)
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

  -- Sales Manager -> manager_id (auto-create if missing)
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
    IF matched_manager_id IS NULL THEN
      INSERT INTO public.managers (name) VALUES (mgr_name_clean)
      RETURNING id INTO new_manager_id;
      NEW.manager_id := new_manager_id;
    ELSE
      NEW.manager_id := matched_manager_id;
    END IF;
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

-- 2) Daily reconciliation: re-derive reps/managers/territories from every dealer row
CREATE OR REPLACE FUNCTION public.reconcile_dealers_source_of_truth()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  created_reps int := 0;
  created_managers int := 0;
  created_territories int := 0;
  relinked int := 0;
BEGIN
  -- Territories
  WITH new_terr AS (
    INSERT INTO public.territories (name)
    SELECT DISTINCT trim(territory)
    FROM public.dealers
    WHERE territory IS NOT NULL AND length(trim(territory)) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.territories t
        WHERE lower(t.name) = lower(trim(public.dealers.territory))
      )
    RETURNING 1
  )
  SELECT count(*) INTO created_territories FROM new_terr;

  -- Sales reps
  WITH new_reps AS (
    INSERT INTO public.sales_reps (name)
    SELECT DISTINCT trim(regexp_replace(salesperson, '\s*\([^)]*\)\s*$', ''))
    FROM public.dealers
    WHERE salesperson IS NOT NULL AND length(trim(salesperson)) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.sales_reps r
        WHERE lower(r.name) = lower(trim(regexp_replace(public.dealers.salesperson, '\s*\([^)]*\)\s*$', '')))
      )
    RETURNING 1
  )
  SELECT count(*) INTO created_reps FROM new_reps;

  -- Managers
  WITH new_mgrs AS (
    INSERT INTO public.managers (name)
    SELECT DISTINCT trim(regexp_replace(sales_manager, '\s*\([^)]*\)\s*$', ''))
    FROM public.dealers
    WHERE sales_manager IS NOT NULL AND length(trim(sales_manager)) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.managers m
        WHERE lower(m.name) = lower(trim(regexp_replace(public.dealers.sales_manager, '\s*\([^)]*\)\s*$', '')))
      )
    RETURNING 1
  )
  SELECT count(*) INTO created_managers FROM new_mgrs;

  -- Re-link dealer rows that still have NULL FKs but raw text values present
  WITH relink AS (
    UPDATE public.dealers d
    SET rep_id = COALESCE(
                   d.rep_id,
                   (SELECT id FROM public.sales_reps r
                      WHERE lower(r.name) = lower(trim(regexp_replace(d.salesperson, '\s*\([^)]*\)\s*$', '')))
                      LIMIT 1)
                 ),
        manager_id = COALESCE(
                       d.manager_id,
                       (SELECT id FROM public.managers m
                          WHERE lower(m.name) = lower(trim(regexp_replace(d.sales_manager, '\s*\([^)]*\)\s*$', '')))
                          LIMIT 1)
                     ),
        territory_id = COALESCE(
                         d.territory_id,
                         (SELECT id FROM public.territories t
                            WHERE lower(t.name) = lower(trim(d.territory))
                            LIMIT 1)
                       )
    WHERE (d.rep_id IS NULL AND d.salesperson IS NOT NULL)
       OR (d.manager_id IS NULL AND d.sales_manager IS NOT NULL)
       OR (d.territory_id IS NULL AND d.territory IS NOT NULL)
    RETURNING 1
  )
  SELECT count(*) INTO relinked FROM relink;

  -- Keep sales_reps.manager_id aligned with the most common manager per rep on dealer rows
  UPDATE public.sales_reps r
  SET manager_id = sub.manager_id
  FROM (
    SELECT rep_id, manager_id
    FROM (
      SELECT rep_id, manager_id, count(*) AS n,
             row_number() OVER (PARTITION BY rep_id ORDER BY count(*) DESC) AS rk
      FROM public.dealers
      WHERE rep_id IS NOT NULL AND manager_id IS NOT NULL
      GROUP BY rep_id, manager_id
    ) ranked
    WHERE rk = 1
  ) sub
  WHERE r.id = sub.rep_id
    AND r.manager_id IS DISTINCT FROM sub.manager_id;

  RETURN jsonb_build_object(
    'created_territories', created_territories,
    'created_reps', created_reps,
    'created_managers', created_managers,
    'relinked_dealers', relinked,
    'ran_at', now()
  );
END;
$function$;

-- 3) Daily schedule at 06:00 UTC
DO $$
BEGIN
  PERFORM cron.unschedule('reconcile-dealers-source-of-truth');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'reconcile-dealers-source-of-truth',
  '0 6 * * *',
  $$ SELECT public.reconcile_dealers_source_of_truth(); $$
);

-- 4) Run it once now to backfill any reps/managers/territories already present in dealers
SELECT public.reconcile_dealers_source_of_truth();