-- Real bug: every Team Updates RLS policy used has_role(), which only
-- checks explicit user_roles rows. Confirmed live: ALL 16 user_reps-linked
-- accounts have zero explicit user_roles='rep' rows, and 2 of 7
-- user_managers-linked accounts have no explicit user_roles='manager' row
-- either - they're only a "manager"/"rep" implicitly, via the link table,
-- exactly like resolveRole() in useUserRole.ts already accounts for
-- client-side. So has_role(uid,'rep') was false for every real rep, and
-- the page showed "No updates yet." (RLS silently returned zero rows, not
-- an error) even though pageAccess.ts correctly let them onto the page.
-- The same gap would have silently rejected posts from the 2 affected
-- managers too.
--
-- has_effective_role() replicates resolveRole()'s exact priority chain
-- (admin email override > user_roles > link table), matching what
-- team_post_recipients()/team_post_audience_size() already do inline -
-- this makes that the one shared, reusable version and swaps it into
-- every Team Updates policy, not just the read ones.

BEGIN;

CREATE OR REPLACE FUNCTION public.has_effective_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $function$
  WITH resolved AS (
    SELECT
      CASE
        WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = _user_id AND lower(u.email) IN ('justin@lineage-collections.com','scott@lineage-collections.com','andrew@lineage-collections.com','gabriella@lineage-collections.com'))
          OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _user_id AND ur.role = 'admin') THEN 'admin'
        WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _user_id AND ur.role = 'manager')
          OR EXISTS (SELECT 1 FROM public.user_managers um WHERE um.user_id = _user_id) THEN 'manager'
        WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _user_id AND ur.role = 'rep')
          OR EXISTS (SELECT 1 FROM public.user_reps ureps WHERE ureps.user_id = _user_id) THEN 'rep'
        WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = _user_id AND ur.role = 'dealer')
          OR EXISTS (SELECT 1 FROM public.user_dealers ud WHERE ud.user_id = _user_id) THEN 'dealer'
        ELSE 'rep'
      END AS role
  )
  SELECT role = _role FROM resolved
$function$;

GRANT EXECUTE ON FUNCTION public.has_effective_role(uuid, text) TO authenticated;

-- team_posts
DROP POLICY "team_posts read internal staff" ON public.team_posts;
CREATE POLICY "team_posts read internal staff" ON public.team_posts FOR SELECT TO authenticated
  USING (public.has_effective_role(auth.uid(), 'admin') OR public.has_effective_role(auth.uid(), 'manager') OR public.has_effective_role(auth.uid(), 'rep'));

DROP POLICY "team_posts insert admin or manager" ON public.team_posts;
CREATE POLICY "team_posts insert admin or manager" ON public.team_posts FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND (public.has_effective_role(auth.uid(), 'admin') OR public.has_effective_role(auth.uid(), 'manager'))
  );

DROP POLICY "team_posts update own or admin" ON public.team_posts;
CREATE POLICY "team_posts update own or admin" ON public.team_posts FOR UPDATE TO authenticated
  USING (public.has_effective_role(auth.uid(), 'admin') OR (public.has_effective_role(auth.uid(), 'manager') AND author_user_id = auth.uid()))
  WITH CHECK (public.has_effective_role(auth.uid(), 'admin') OR (public.has_effective_role(auth.uid(), 'manager') AND author_user_id = auth.uid()));

DROP POLICY "team_posts delete own or admin" ON public.team_posts;
CREATE POLICY "team_posts delete own or admin" ON public.team_posts FOR DELETE TO authenticated
  USING (public.has_effective_role(auth.uid(), 'admin') OR (public.has_effective_role(auth.uid(), 'manager') AND author_user_id = auth.uid()));

-- team_post_attachments
DROP POLICY "team_post_attachments read internal staff" ON public.team_post_attachments;
CREATE POLICY "team_post_attachments read internal staff" ON public.team_post_attachments FOR SELECT TO authenticated
  USING (public.has_effective_role(auth.uid(), 'admin') OR public.has_effective_role(auth.uid(), 'manager') OR public.has_effective_role(auth.uid(), 'rep'));

DROP POLICY "team_post_attachments insert admin or manager" ON public.team_post_attachments;
CREATE POLICY "team_post_attachments insert admin or manager" ON public.team_post_attachments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.team_posts p WHERE p.id = team_post_attachments.post_id AND p.author_user_id = auth.uid())
    AND (public.has_effective_role(auth.uid(), 'admin') OR public.has_effective_role(auth.uid(), 'manager'))
  );

DROP POLICY "team_post_attachments delete own or admin" ON public.team_post_attachments;
CREATE POLICY "team_post_attachments delete own or admin" ON public.team_post_attachments FOR DELETE TO authenticated
  USING (
    public.has_effective_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.team_posts p WHERE p.id = team_post_attachments.post_id AND p.author_user_id = auth.uid())
  );

-- team_post_reactions (delete own is already just user_id = auth.uid(), untouched)
DROP POLICY "team_post_reactions read internal staff" ON public.team_post_reactions;
CREATE POLICY "team_post_reactions read internal staff" ON public.team_post_reactions FOR SELECT TO authenticated
  USING (public.has_effective_role(auth.uid(), 'admin') OR public.has_effective_role(auth.uid(), 'manager') OR public.has_effective_role(auth.uid(), 'rep'));

DROP POLICY "team_post_reactions insert own" ON public.team_post_reactions;
CREATE POLICY "team_post_reactions insert own" ON public.team_post_reactions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (public.has_effective_role(auth.uid(), 'admin') OR public.has_effective_role(auth.uid(), 'manager') OR public.has_effective_role(auth.uid(), 'rep'))
  );

-- team_post_reads (update own is already just user_id = auth.uid(), untouched)
DROP POLICY "team_post_reads read internal staff" ON public.team_post_reads;
CREATE POLICY "team_post_reads read internal staff" ON public.team_post_reads FOR SELECT TO authenticated
  USING (public.has_effective_role(auth.uid(), 'admin') OR public.has_effective_role(auth.uid(), 'manager') OR public.has_effective_role(auth.uid(), 'rep'));

DROP POLICY "team_post_reads insert own" ON public.team_post_reads;
CREATE POLICY "team_post_reads insert own" ON public.team_post_reads FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (public.has_effective_role(auth.uid(), 'admin') OR public.has_effective_role(auth.uid(), 'manager') OR public.has_effective_role(auth.uid(), 'rep'))
  );

-- storage.objects (team-post-attachments bucket)
DROP POLICY "team-post-attachments read internal staff" ON storage.objects;
CREATE POLICY "team-post-attachments read internal staff" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'team-post-attachments' AND (public.has_effective_role(auth.uid(), 'admin') OR public.has_effective_role(auth.uid(), 'manager') OR public.has_effective_role(auth.uid(), 'rep')));

DROP POLICY "team-post-attachments write admin or manager" ON storage.objects;
CREATE POLICY "team-post-attachments write admin or manager" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'team-post-attachments' AND (public.has_effective_role(auth.uid(), 'admin') OR public.has_effective_role(auth.uid(), 'manager')));

DROP POLICY "team-post-attachments delete admin or manager" ON storage.objects;
CREATE POLICY "team-post-attachments delete admin or manager" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'team-post-attachments' AND (public.has_effective_role(auth.uid(), 'admin') OR public.has_effective_role(auth.uid(), 'manager')));

COMMIT;
