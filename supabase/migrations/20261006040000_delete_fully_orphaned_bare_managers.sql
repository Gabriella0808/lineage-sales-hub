-- The bare "Mateo"/"Will" manager rows were deliberately kept alive in
-- 20261006010000 because public.crm_accounts (Prospects) still referenced
-- them at the time. 20261006030000 just repointed those last references.
-- Full FK scan (all 7 tables with a FK to managers.id) now shows zero
-- remaining references anywhere - safe to delete outright, completing the
-- original dedup.
DELETE FROM public.managers WHERE id IN (
  '5c2be50c-3144-4d88-8227-1c0af5aa3c94', -- "Mateo"
  'dd821573-dce7-4a5c-938d-535927608680'  -- "Will"
);
