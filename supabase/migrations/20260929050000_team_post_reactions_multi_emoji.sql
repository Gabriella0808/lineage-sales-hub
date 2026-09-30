-- Multiple reaction types per post (Slack/iMessage-style), not just a
-- single thumbs-up. A person can react with more than one emoji on the
-- same post (one row per post+user+emoji), and each emoji gets its own
-- toggleable pill with its own count in the UI.

BEGIN;

ALTER TABLE public.team_post_reactions ADD COLUMN emoji text NOT NULL DEFAULT '👍';
ALTER TABLE public.team_post_reactions ALTER COLUMN emoji DROP DEFAULT;

ALTER TABLE public.team_post_reactions DROP CONSTRAINT team_post_reactions_pkey;
ALTER TABLE public.team_post_reactions ADD CONSTRAINT team_post_reactions_pkey PRIMARY KEY (post_id, user_id, emoji);

-- Fixed quick-reaction set, matches the picker in TeamUpdatesPage.tsx -
-- keeps this a controlled vocabulary rather than free-text emoji.
ALTER TABLE public.team_post_reactions ADD CONSTRAINT team_post_reactions_emoji_check
  CHECK (emoji IN ('👍', '❤️', '😂', '😮', '🎉', '👏'));

COMMIT;
