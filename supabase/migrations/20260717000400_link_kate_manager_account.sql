-- Kate has two rows in managers: one seeded with only name='Kate' (no email),
-- and another (pre-existing) with email='kate@lineage-collections.com'.
-- The unique constraint on managers.email blocked a naive UPDATE.
--
-- Fix: delete the emailless duplicate, then link Kate's auth account.

-- 1. Remove the duplicate Kate row that has no email.
--    This is safe — no dealers or crm_accounts should reference it
--    because it was never properly linked to any auth user.
DELETE FROM public.managers
WHERE lower(name) = 'kate'
  AND (email IS NULL OR email = '');

-- 2. Link Kate's auth user to the managers row that already has her email.
INSERT INTO public.user_managers (user_id, manager_id)
SELECT u.id, m.id
FROM auth.users u
JOIN public.managers m ON lower(m.email) = lower(u.email)
WHERE lower(u.email) = 'kate@lineage-collections.com'
ON CONFLICT (user_id) DO NOTHING;

-- 3. Ensure Kate has the manager role in user_roles (idempotent).
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'manager'
FROM auth.users u
WHERE lower(u.email) = 'kate@lineage-collections.com'
ON CONFLICT (user_id, role) DO NOTHING;
