-- Brian Beane (brian.beane@villagematrix.com) was given role='manager' in
-- user_roles, but has no public.managers row and no user_managers link -
-- so current_manager_id() returns NULL for him, and Dealer/Rep Reporting's
-- "no rep/manager scope could be resolved" safety branch returns zero rows
-- regardless of what's selected in the Manager filter. Same root cause as
-- Kate Jones's issue earlier.
--
-- Per explicit instruction: he's a portal user only, not a real sales
-- manager - not linked to any dealers or reps, and nothing is backfilled
-- onto existing dealer/rep records for him. This manager row exists only
-- so he passes current_manager_id()'s "is this a recognized manager" check;
-- with no dealers/reps of his own and the reporting filter defaulting to
-- "All managers" (as already shown in his portal), he sees the same
-- company-wide view any manager choosing that filter would.

INSERT INTO public.managers (name, email)
VALUES ('Brian Beane', 'brian.beane@villagematrix.com');

INSERT INTO public.user_managers (user_id, manager_id)
SELECT 'a7622d4b-e7a2-47bc-bbd9-d5ba7bd4cca8', m.id
FROM public.managers m
WHERE m.email = 'brian.beane@villagematrix.com';
