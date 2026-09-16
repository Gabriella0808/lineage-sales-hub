-- ══════════════════════════════════════════════════════════════════════════════
-- Guarantee EVERY portal account is assignable for staff (admin/manager)
-- callers, not just the ones matching one of several hand-maintained
-- allowlists.
--
-- The previous version of assignable_users() (see
-- 20260916010000_add_reps_to_assignable_users.sql) unioned four separate
-- branches for staff callers: user_roles.role='admin', managers matched by
-- email, 6 hardcoded customer-service email addresses, and reps linked via
-- user_reps. Verified directly against the live data that this happened to
-- cover all 25 current auth.users rows — but it's a fragile pattern: a
-- future account that doesn't fit any of those four specific shapes (e.g. a
-- new staff hire who isn't yet in `managers`, isn't one of the 6 hardcoded
-- CS emails, and isn't a rep) would silently never appear as assignable.
--
-- This replaces those four branches with one: every auth.users row, for a
-- staff caller, with a best-effort role label (admin > manager > rep >
-- "staff" fallback for anyone who doesn't match any of those, e.g. the
-- hardcoded CS accounts) computed the same way as before, just derived
-- inline instead of gating which rows even appear.
--
-- UNCHANGED: the rep-caller branch (a rep only ever sees their own manager
-- as an assignable option) — reps still cannot assign tasks to other reps
-- or see the full user list, exactly as before.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.assignable_users()
 RETURNS TABLE(user_id uuid, full_name text, email text, role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (user_id) user_id, full_name, email, role
  FROM (
    -- Staff callers (admin/manager) see every portal account.
    SELECT u.id AS user_id,
           COALESCE(NULLIF(sr.name, ''), NULLIF(p.full_name, ''), NULLIF(m.name, ''), initcap(split_part(u.email, '@', 1))) AS full_name,
           u.email::text,
           CASE
             WHEN ur_admin.user_id IS NOT NULL THEN 'admin'
             WHEN m.id IS NOT NULL THEN 'manager'
             WHEN sr.id IS NOT NULL THEN 'rep'
             -- Same customer-service roster EmailGuard.tsx's isCustomerService()
             -- uses elsewhere in the app (e.g. the sidebar role badge) — reuse
             -- that exact real title rather than inventing a generic label.
             WHEN lower(u.email) IN ('tammy@lineage-collections.com', 'jessica@lineage-collections.com', 'melissa@lineage-collections.com', 'michelle@lineage-collections.com', 'miranda@lineage-collections.com', 'sarah@lineage-collections.com') THEN 'customer service'
             ELSE 'team'
           END AS role,
           1 AS priority
    FROM auth.users u
    LEFT JOIN public.user_roles ur_admin ON ur_admin.user_id = u.id AND ur_admin.role = 'admin'
    LEFT JOIN public.managers m ON lower(m.email) = lower(u.email)
    LEFT JOIN public.user_reps ur_rep ON ur_rep.user_id = u.id
    LEFT JOIN public.sales_reps sr ON sr.id = ur_rep.rep_id
    LEFT JOIN public.profiles p ON p.user_id = u.id
    WHERE (public.is_admin() OR public.current_manager_id() IS NOT NULL)

    UNION ALL

    -- A rep caller only sees their own manager (unchanged)
    SELECT u.id AS user_id,
           COALESCE(NULLIF(p.full_name, ''), m.name) AS full_name,
           u.email::text, 'manager'::text AS role, 1 AS priority
    FROM public.sales_reps sr
    JOIN public.managers m ON m.id = sr.manager_id
    JOIN auth.users u ON lower(u.email) = lower(m.email)
    LEFT JOIN public.profiles p ON p.user_id = u.id
    WHERE NOT (public.is_admin() OR public.current_manager_id() IS NOT NULL)
      AND sr.id IN (SELECT public.current_rep_ids())
  ) ranked
  ORDER BY user_id, priority
$function$;
