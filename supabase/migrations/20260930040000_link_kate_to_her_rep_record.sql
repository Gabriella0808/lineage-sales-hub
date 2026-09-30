-- Kate (kate@lineage-collections.com) has a 'manager' user_roles row but no
-- user_reps link at all - without one, the app has no way to know which
-- bookings are "hers" for the new rep-scoped Pre-Sale view. Her real
-- Acctivate rep record is sales_reps.acctivate_id = 'jones' ("Kate Jones"),
-- found by name match. This only adds the missing link; her role stays
-- 'manager' (unrelated pages she needs manager access to are untouched) -
-- the Pre-Sale/Team Updates scoping for her specifically is handled in
-- application code (see REP_VIEW_OVERRIDE_EMAILS in useUserRole.ts).

INSERT INTO public.user_reps (user_id, rep_id)
SELECT u.id, sr.id
FROM auth.users u, public.sales_reps sr
WHERE lower(u.email) = 'kate@lineage-collections.com'
  AND sr.acctivate_id = 'jones'
ON CONFLICT (user_id, rep_id) DO NOTHING;
