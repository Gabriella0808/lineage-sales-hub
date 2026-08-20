-- Add Tammy, Sarah, and Miranda as daily performance email recipients
-- by granting them the manager role. Their existing roles (e.g. rep) are
-- preserved — the unique constraint is on (user_id, role), so this is additive.

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'manager'::public.app_role
FROM auth.users u
WHERE u.email IN (
  'tammy@lineage-collections.com',
  'sarah@lineage-collections.com',
  'miranda@lineage-collections.com'
)
ON CONFLICT (user_id, role) DO NOTHING;
