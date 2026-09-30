-- All reps now get full view + react access to Team Updates - same content
-- everyone else sees, same reaction picker. Posting/editing/deleting/
-- pinning stays admin or manager only; those INSERT/UPDATE/DELETE
-- policies are untouched. This is the counterpart to
-- 20260930020000_team_updates_exclude_reps.sql, which removed rep from
-- these same policies when the feature first launched restricted.

BEGIN;

DROP POLICY "team_posts read internal staff" ON public.team_posts;
CREATE POLICY "team_posts read internal staff" ON public.team_posts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'rep'));

DROP POLICY "team_post_attachments read internal staff" ON public.team_post_attachments;
CREATE POLICY "team_post_attachments read internal staff" ON public.team_post_attachments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'rep'));

DROP POLICY "team_post_reactions read internal staff" ON public.team_post_reactions;
CREATE POLICY "team_post_reactions read internal staff" ON public.team_post_reactions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'rep'));

DROP POLICY "team_post_reactions insert own" ON public.team_post_reactions;
CREATE POLICY "team_post_reactions insert own" ON public.team_post_reactions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'rep'))
  );

DROP POLICY "team_post_reads read internal staff" ON public.team_post_reads;
CREATE POLICY "team_post_reads read internal staff" ON public.team_post_reads FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'rep'));

DROP POLICY "team_post_reads insert own" ON public.team_post_reads;
CREATE POLICY "team_post_reads insert own" ON public.team_post_reads FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'rep'))
  );

DROP POLICY "team-post-attachments read internal staff" ON storage.objects;
CREATE POLICY "team-post-attachments read internal staff" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'team-post-attachments' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'rep')));

COMMIT;
