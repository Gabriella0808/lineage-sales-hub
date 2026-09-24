-- Marks a sign-in row as admin access to another person's account (using
-- their real credentials) rather than that person's own login, so "Last
-- Login" figures can report the account owner's real most-recent login.
-- Nothing is ever deleted from sign_in_log — this only annotates rows.
--
-- Immediate use: Kate Jones's two sign-ins on 2026-09-24 were confirmed by
-- Gabriella to be her own access to Kate's account, not Kate's. Tagged
-- here by their specific row ids rather than a blanket rule.

ALTER TABLE public.sign_in_log
  ADD COLUMN IF NOT EXISTS admin_actor_user_id uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.sign_in_log.admin_actor_user_id IS
  'Set when this sign-in was an admin accessing another user''s account with their credentials, not that user''s own login. Excluded from last-login calculations.';

UPDATE public.sign_in_log
SET admin_actor_user_id = '4a7556a9-dc13-4b3d-92ba-58960101d0bb'  -- gabriella@lineage-collections.com
WHERE id IN ('0b0cd7dd-0606-4782-be6c-89fecf0877f8', 'fcbe6833-49bf-48bf-95b7-4cecf5900f5a');

CREATE OR REPLACE FUNCTION public.get_rep_last_logins()
 RETURNS TABLE(rep_id uuid, rep_name text, email text, last_signed_in_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    min(sr.id::text)::uuid AS rep_id,
    string_agg(DISTINCT sr.name, ' / ' ORDER BY sr.name) AS rep_name,
    min(au.email) AS email,
    max(sil.signed_in_at) FILTER (WHERE sil.admin_actor_user_id IS NULL) AS last_signed_in_at
  FROM public.sales_reps sr
  JOIN public.user_reps ur ON ur.rep_id = sr.id
  LEFT JOIN auth.users au ON au.id = ur.user_id
  LEFT JOIN public.sign_in_log sil ON sil.user_id = ur.user_id
  WHERE
    (
      public.is_admin()
      OR (public.has_role(auth.uid(), 'manager') AND lower(auth.email()) <> 'kate@lineage-collections.com')
      OR sr.id IN (SELECT public.current_manager_rep_ids())
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles uro
      WHERE uro.user_id = ur.user_id AND uro.role IN ('admin', 'manager')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_managers um WHERE um.user_id = ur.user_id
    )
  GROUP BY ur.user_id

  UNION ALL

  SELECT
    sr.id AS rep_id,
    sr.name AS rep_name,
    au.email AS email,
    max(sil.signed_in_at) FILTER (WHERE sil.admin_actor_user_id IS NULL) AS last_signed_in_at
  FROM public.sales_reps sr
  JOIN auth.users au ON lower(au.email) = 'kate@lineage-collections.com'
  LEFT JOIN public.sign_in_log sil ON sil.user_id = au.id
  WHERE sr.id = '75eb2c49-31b0-4071-9232-0156b4459c3f'
    AND (public.is_admin() OR public.has_role(auth.uid(), 'manager'))
    AND lower(auth.email()) <> 'kate@lineage-collections.com'
  GROUP BY sr.id, sr.name, au.email;
$function$;
