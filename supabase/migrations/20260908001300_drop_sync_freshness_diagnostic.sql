DROP FUNCTION IF EXISTS public._diag_sync_freshness();
NOTIFY pgrst, 'reload schema';
