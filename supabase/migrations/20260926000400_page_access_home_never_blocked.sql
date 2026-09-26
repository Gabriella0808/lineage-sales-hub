-- "Home" is where a blocked page redirects to, so it must never be blockable
-- (otherwise a person blocked from Home would bounce between Home and Home).
-- The Portal Access editor can't override it and neither can the database.
-- Removes the one seeded Home row (it only re-stated "allowed") and forbids more.

BEGIN;

DELETE FROM public.page_access_role_overrides WHERE page_key = 'home';
DELETE FROM public.page_access_user_overrides WHERE page_key = 'home';

ALTER TABLE public.page_access_role_overrides
  ADD CONSTRAINT page_access_role_overrides_not_home CHECK (page_key <> 'home');
ALTER TABLE public.page_access_user_overrides
  ADD CONSTRAINT page_access_user_overrides_not_home CHECK (page_key <> 'home');

COMMIT;
