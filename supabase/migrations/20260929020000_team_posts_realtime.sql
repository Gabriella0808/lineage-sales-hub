-- Team Updates is a chat UI: new messages need to appear live without a
-- page refresh, the same way the notifications bell already updates live.
-- These two tables aren't in the realtime publication yet.

BEGIN;

ALTER PUBLICATION supabase_realtime ADD TABLE public.team_posts, public.team_post_attachments;

COMMIT;
