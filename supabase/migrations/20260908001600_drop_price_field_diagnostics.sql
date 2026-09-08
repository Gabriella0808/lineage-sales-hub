DROP FUNCTION IF EXISTS public._diag_price_field_check(int);
DROP FUNCTION IF EXISTS public._diag_price_field_match_stats();
NOTIFY pgrst, 'reload schema';
