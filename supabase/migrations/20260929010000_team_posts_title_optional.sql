-- Team Updates is being redesigned as a proper chat UI (message bubbles, no
-- per-message subject line) rather than a blog-post feed. Nothing has been
-- posted yet (this table went live moments ago, Gabriella-only), so this is
-- a plain, safe constraint relaxation - title becomes optional instead of
-- required.

BEGIN;

ALTER TABLE public.team_posts ALTER COLUMN title DROP NOT NULL;
ALTER TABLE public.team_posts DROP CONSTRAINT IF EXISTS team_posts_title_check;

COMMIT;
