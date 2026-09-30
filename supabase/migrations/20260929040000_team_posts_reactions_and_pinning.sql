-- Reactions (a simple toggleable "like", one per person per post) and
-- pinning (admin-only, keeps an important post at the top of the feed).
-- "Seen by" needs no new table - it's read straight off the notifications
-- rows notify-team-post already creates (read_at set once someone opens
-- their bell and reads it).

BEGIN;

ALTER TABLE public.team_posts ADD COLUMN pinned boolean NOT NULL DEFAULT false;

CREATE TABLE public.team_post_reactions (
  post_id uuid NOT NULL REFERENCES public.team_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

ALTER TABLE public.team_post_reactions ENABLE ROW LEVEL SECURITY;

-- Read: internal staff only, same as team_posts itself.
CREATE POLICY "team_post_reactions read internal staff" ON public.team_post_reactions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'rep'));

-- Write: anyone who can read a post can react to it, but only as themselves.
CREATE POLICY "team_post_reactions insert own" ON public.team_post_reactions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'rep'))
  );
CREATE POLICY "team_post_reactions delete own" ON public.team_post_reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.team_post_reactions FROM anon;
GRANT SELECT, INSERT, DELETE ON public.team_post_reactions TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.team_post_reactions;

COMMIT;
