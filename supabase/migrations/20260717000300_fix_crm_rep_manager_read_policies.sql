-- Fix: CRM prospects page showed "-" for Rep and Manager columns.
--
-- Root cause:
-- 1. managers table: only admins could SELECT (no SELECT policy for managers role),
--    so useCrmManagers() returned [] for manager-role users.
-- 2. sales_reps table: the existing "Managers manage sales_reps" policy uses
--    current_manager_id() IS NOT NULL, which requires the user's auth.uid() to be
--    in user_managers. If that link is missing, the query returns [] even for a
--    valid manager-role user.
--
-- Fix: add explicit SELECT policies using has_role() (backed by user_roles table,
-- which is what the portal's useUserRole() hook uses for role determination).
-- Existing policies are kept intact; these are additive permissive policies.

-- 1. Allow admins and managers to read all managers.
CREATE POLICY "Admins and managers can read managers"
ON public.managers FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR public.has_role(auth.uid(), 'manager')
);

-- 2. Allow admins and managers to read all sales_reps
--    (supplements the existing current_manager_id()-based policy so that
--    managers without a user_managers row still see the full rep list).
CREATE POLICY "Admins and managers can read sales_reps"
ON public.sales_reps FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR public.has_role(auth.uid(), 'manager')
);
