-- Allow all authenticated users to read all check-ins (team-wide view)
-- The previous policy restricted to user_id = auth.uid() which broke the
-- team map, recent check-ins strip, and analytics for everyone.
DROP POLICY IF EXISTS "Users read own check-ins" ON public.dealer_check_ins;
CREATE POLICY "Authenticated users can read all check-ins"
ON public.dealer_check_ins
FOR SELECT
TO authenticated
USING (true);
