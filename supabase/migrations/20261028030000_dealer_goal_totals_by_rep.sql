-- Rep Reporting "2027 Goal" column: each rep's total of the per-dealer
-- goals (dealer_annual_goals) on the dealers assigned to them
-- (dealers.rep_id). Keyed on the rep's lower/trimmed Acctivate ID - the
-- same key get_sales_reporting_grouped_rows returns as entity_key for
-- p_group_by = 'rep'. Read-only; goals are already readable by every
-- authenticated user.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_dealer_goal_totals_by_rep(p_year integer)
 RETURNS TABLE(rep_key text, total_goal numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT lower(trim(sr.acctivate_id)), SUM(g.amount)
  FROM public.dealer_annual_goals g
  JOIN public.dealers d
    ON d.source = 'acctivate'
   AND d.status = 'active'
   AND lower(trim(d.acctivate_id)) = g.customer_key
  JOIN public.sales_reps sr ON sr.id = d.rep_id
  WHERE g.goal_year = p_year
    AND NULLIF(trim(sr.acctivate_id), '') IS NOT NULL
  GROUP BY 1
$function$;

REVOKE ALL ON FUNCTION public.get_dealer_goal_totals_by_rep(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dealer_goal_totals_by_rep(integer) TO authenticated;

COMMIT;
