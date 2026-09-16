-- ══════════════════════════════════════════════════════════════════════════════
-- Add sales reps as assignable options in the "Assign to…" task picker, for
-- staff callers (admin/manager) only.
--
-- assignable_users() previously offered only admins, email-matched managers,
-- and 6 hardcoded customer-service addresses. Plain sales rep accounts were
-- never included, so a manager/admin could never actually pick a rep as a
-- task assignee — confirmed via direct query that zero tasks in the live
-- data currently reference any of the 13 real rep accounts as an assignee.
--
-- This adds one more branch, sourced via user_reps (so only reps with an
-- actual linked portal login are offered — a sales_reps row with no login
-- couldn't see a task assigned to it anyway), gated by the exact same
-- "staff caller" condition already used for the admin/manager/CS branches
-- (public.is_admin() OR public.current_manager_id() IS NOT NULL).
--
-- The existing rep-caller branch (a rep only sees their own manager) is
-- untouched — reps still cannot assign tasks to other reps, only to their
-- manager, exactly as before.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.assignable_users()
 RETURNS TABLE(user_id uuid, full_name text, email text, role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (user_id) user_id, full_name, email, role
  FROM (
    -- Admins (priority 1) - staff callers only
    SELECT ur.user_id,
           COALESCE(NULLIF(p.full_name, ''), split_part(u.email, '@', 1)) AS full_name,
           u.email::text, 'admin'::text AS role, 1 AS priority
    FROM public.user_roles ur
    JOIN auth.users u ON u.id = ur.user_id
    LEFT JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.role = 'admin'
      AND (public.is_admin() OR public.current_manager_id() IS NOT NULL)

    UNION ALL

    -- Managers matched by email (priority 2) - staff callers only
    SELECT u.id AS user_id,
           COALESCE(NULLIF(p.full_name, ''), m.name) AS full_name,
           u.email::text, 'manager'::text AS role, 2 AS priority
    FROM public.managers m
    JOIN auth.users u ON lower(u.email) = lower(m.email)
    LEFT JOIN public.profiles p ON p.user_id = u.id
    WHERE (public.is_admin() OR public.current_manager_id() IS NOT NULL)

    UNION ALL

    -- Customer service team (priority 3) - staff callers only
    SELECT u.id AS user_id,
           COALESCE(NULLIF(p.full_name, ''), initcap(split_part(u.email, '@', 1))) AS full_name,
           u.email::text, 'rep'::text AS role, 3 AS priority
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.user_id = u.id
    WHERE lower(u.email) IN ('tammy@lineage-collections.com', 'jessica@lineage-collections.com', 'melissa@lineage-collections.com', 'michelle@lineage-collections.com', 'miranda@lineage-collections.com', 'sarah@lineage-collections.com')
      AND (public.is_admin() OR public.current_manager_id() IS NOT NULL)

    UNION ALL

    -- NEW: real sales reps (priority 4) - staff callers only. Sourced via
    -- user_reps so only reps with an actual linked portal login appear.
    -- Name preference here is deliberately sr.name FIRST (the authoritative
    -- roster name), falling back to profiles.full_name only if the roster
    -- has no name — the reverse of the other branches above, because these
    -- reps' profiles.full_name was auto-populated from their email's local
    -- part at signup (e.g. "bbq1994") and never updated with a real name.
    SELECT ur2.user_id,
           COALESCE(NULLIF(sr.name, ''), NULLIF(p.full_name, ''), initcap(split_part(u.email, '@', 1))) AS full_name,
           u.email::text, 'rep'::text AS role, 4 AS priority
    FROM public.user_reps ur2
    JOIN public.sales_reps sr ON sr.id = ur2.rep_id
    JOIN auth.users u ON u.id = ur2.user_id
    LEFT JOIN public.profiles p ON p.user_id = ur2.user_id
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
