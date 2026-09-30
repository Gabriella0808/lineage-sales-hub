-- A chat message can be attachment-only (a photo with no caption, the same
-- as WhatsApp) - body needs to allow that instead of requiring real text.

BEGIN;

ALTER TABLE public.team_posts ALTER COLUMN body DROP NOT NULL;
ALTER TABLE public.team_posts DROP CONSTRAINT IF EXISTS team_posts_body_check;

COMMIT;
