-- Every admin and every manager now sees the full company-wide Rep Login
-- Activity roster, except Kate Jones, who keeps her own manager-scoped view.
-- Replaces the earlier named-exception list (mateo/will/chris), since all
-- three are managers and are already covered by the new blanket rule.

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
    max(sil.signed_in_at) AS last_signed_in_at
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
  GROUP BY ur.user_id;
$function$;
