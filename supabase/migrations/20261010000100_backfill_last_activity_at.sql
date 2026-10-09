-- One-time backfill for the new profiles.last_activity_at column
-- (20261010000000_rep_portal_activity_tracking.sql).
--
-- The triggers added in that migration only fire on NEW dealer_check_ins /
-- team_post_reads rows going forward. Without this backfill, every rep
-- would show "No activity yet" today even though their real historical
-- check-ins, team update reads, and logins prove otherwise (e.g. Kate
-- Jones has real check-ins as recent as yesterday). This seeds
-- last_activity_at once from the best existing signal per user:
--   - their most recent dealer_check_ins.created_at
--   - their most recent team_post_reads.read_at
--   - their most recent real (non-admin-impersonation) sign_in_log entry
-- This only reads from sign_in_log, never writes to it or to
-- auth.users.last_sign_in_at - the login audit trail is untouched.

BEGIN;

WITH signals AS (
  SELECT user_id, max(created_at) AS ts FROM public.dealer_check_ins GROUP BY user_id
  UNION ALL
  SELECT user_id, max(read_at) AS ts FROM public.team_post_reads GROUP BY user_id
  UNION ALL
  SELECT user_id, max(signed_in_at) AS ts FROM public.sign_in_log
    WHERE admin_actor_user_id IS NULL
    GROUP BY user_id
),
best AS (
  SELECT user_id, max(ts) AS last_activity_at FROM signals GROUP BY user_id
)
UPDATE public.profiles p
SET last_activity_at = b.last_activity_at
FROM best b
WHERE p.user_id = b.user_id
  AND (p.last_activity_at IS NULL OR p.last_activity_at < b.last_activity_at);

COMMIT;
