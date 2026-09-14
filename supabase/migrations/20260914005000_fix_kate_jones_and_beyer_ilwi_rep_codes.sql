-- ══════════════════════════════════════════════════════════════════════════════
-- Category 3 (rep-code drift) from the "all reps" Dealer vs Rep Reporting
-- diagnostic: 2 real sales_reps rows whose stored acctivate_id is stale -
-- zero live transactions use the stored code, while a different, clearly
-- related code is actively in use.
--
--   1. Kate Jones (id 75eb2c49-31b0-4071-9232-0156b4459c3f)
--      stored acctivate_id = 'Kate' -> 0 transactions ever used 'kate'
--      live transactions use 'jones' (28 lines, $8,473.00 Jul 1 - today,
--      rep_name "Kate Jones (IN & KY)")
--
--   2. "IL-WI (open)" / Alex Beyer (id 365e6edd-c17c-486f-bd9e-bea32a8203dd)
--      stored acctivate_id = 'Beyer' -> 0 transactions used 'beyer' this period
--      live transactions use 'il-wi' (20 lines, $7,330.00 Jul 1 - today)
--
-- This only corrects each row's own acctivate_id to match the code already
-- in active use - no dealer.rep_id changes, no territory/manager changes,
-- no transaction/source data changes. A separate placeholder row named
-- "Jones" (acctivate_id NULL, linked to one dormant dealer with zero
-- recent activity) is untouched - it is not the same row as Kate Jones.
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE public.sales_reps SET acctivate_id = 'jones'
WHERE id = '75eb2c49-31b0-4071-9232-0156b4459c3f';

UPDATE public.sales_reps SET acctivate_id = 'il-wi'
WHERE id = '365e6edd-c17c-486f-bd9e-bea32a8203dd';

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- select round(sum(primary_amt),2) from get_sales_reporting_grouped_rows(
--   'invoiced','rep','2026-07-01', current_date, NULL,NULL,NULL,NULL,NULL,
--   ARRAY['jones'], NULL);
-- -- expect ~8473.00
--
-- select round(sum(primary_amt),2) from get_sales_reporting_grouped_rows(
--   'invoiced','rep','2026-07-01', current_date, NULL,NULL,NULL,NULL,NULL,
--   ARRAY['il-wi'], NULL);
-- -- expect ~7330.00
-- ══════════════════════════════════════════════════════════════════════════════
