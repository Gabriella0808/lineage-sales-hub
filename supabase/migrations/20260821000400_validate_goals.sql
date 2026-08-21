-- VALIDATION QUERIES FOR SALES TARGETS / GOALS
-- Run these in Supabase SQL editor to confirm the goal data pipeline is correct.
-- These are read-only SELECT queries — safe to run at any time.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. What is stored in rep_targets for 2026?
--    Expected: one row per active rep, non-zero monthly values.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  sr.name                    AS rep_name,
  sr.acctivate_id            AS acctivate_id,
  rt.rep_id                  AS target_rep_id,
  sr.id                      AS sales_rep_id,
  rt.rep_id = sr.id          AS uuid_match,
  rt.jan, rt.feb, rt.mar, rt.apr, rt.may, rt.jun,
  rt.jul, rt.aug, rt.sep, rt.oct, rt.nov, rt.dec,
  rt.annual_target
FROM public.rep_targets rt
LEFT JOIN public.sales_reps sr ON sr.id = rt.rep_id
WHERE rt.year = 2026
ORDER BY sr.name NULLS LAST;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Orphaned rep_targets rows — targets whose rep_id has no matching sales_rep.
--    Expected: 0 rows.  If > 0, run migration 20260821000100 to clean them up.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT rt.rep_id, rt.annual_target, rt.aug
FROM public.rep_targets rt
WHERE rt.year = 2026
  AND rt.rep_id NOT IN (SELECT id FROM public.sales_reps);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Active reps with NO 2026 target row.
--    Expected: 0 rows (every active rep should have a target).
-- ─────────────────────────────────────────────────────────────────────────────
SELECT sr.id, sr.name, sr.acctivate_id
FROM public.sales_reps sr
WHERE NOT EXISTS (
  SELECT 1 FROM public.rep_targets rt WHERE rt.rep_id = sr.id AND rt.year = 2026
)
ORDER BY sr.name;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. August 2026 goal totals — all active reps.
--    This is what the Live KPI "Booking Goal / Invoice Goal" should show
--    when "All Managers" is selected and today is in August.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  COUNT(*)           AS rep_count,
  SUM(rt.aug)        AS total_aug_goal,
  MIN(rt.aug)        AS min_rep_aug_goal,
  MAX(rt.aug)        AS max_rep_aug_goal
FROM public.rep_targets rt
JOIN public.sales_reps sr ON sr.id = rt.rep_id
WHERE rt.year = 2026;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Per-rep August 2026 goal vs August invoiced actual.
--    Used to validate Rep Reporting MTD % column.
--    entity_key in the RPC = sales_reps.acctivate_id (lowercase).
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  sr.name                              AS rep_name,
  lower(sr.acctivate_id)               AS acctivate_id,
  rt.aug                               AS aug_goal,
  COALESCE(act.aug_invoiced, 0)        AS aug_invoiced_actual,
  COALESCE(act.aug_bookings, 0)        AS aug_bookings_actual,
  CASE WHEN rt.aug > 0
    THEN ROUND((COALESCE(act.aug_invoiced, 0) / rt.aug) * 100, 1)
  END                                  AS invoiced_pct_of_goal,
  CASE WHEN rt.aug > 0
    THEN ROUND((COALESCE(act.aug_bookings, 0) / rt.aug) * 100, 1)
  END                                  AS bookings_pct_of_goal
FROM public.rep_targets rt
JOIN public.sales_reps sr ON sr.id = rt.rep_id
LEFT JOIN (
  SELECT
    rep_id,
    SUM(CASE WHEN metric_type = 'invoiced'  THEN amount ELSE 0 END) AS aug_invoiced,
    SUM(CASE WHEN metric_type = 'bookings'  THEN amount ELSE 0 END) AS aug_bookings
  FROM public.v_companywide_reporting_actuals
  WHERE transaction_date >= '2026-08-01'
    AND transaction_date <= '2026-08-31'
  GROUP BY rep_id
) act ON lower(act.rep_id) = lower(sr.acctivate_id)
WHERE rt.year = 2026
ORDER BY sr.name;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Per-manager August 2026 goal total.
--    Validates Live KPI when a specific manager is selected.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  m.name                 AS manager_name,
  COUNT(sr.id)           AS rep_count,
  SUM(rt.aug)            AS aug_goal_total
FROM public.managers m
JOIN public.sales_reps sr ON sr.manager_id = m.id
LEFT JOIN public.rep_targets rt ON rt.rep_id = sr.id AND rt.year = 2026
GROUP BY m.name
ORDER BY m.name;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. YTD 2026 goal (Jan–Aug) vs YTD invoiced actual — all reps.
--    For invoiced: actuals exist for all months.
--    For bookings: actuals only valid from Aug 1.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  'goals_ytd_jan_aug'    AS metric,
  SUM(rt.jan + rt.feb + rt.mar + rt.apr + rt.may + rt.jun + rt.jul + rt.aug) AS ytd_goal
FROM public.rep_targets rt
JOIN public.sales_reps sr ON sr.id = rt.rep_id
WHERE rt.year = 2026

UNION ALL

SELECT
  'invoiced_ytd_jan_aug' AS metric,
  ROUND(SUM(amount), 0)  AS ytd_goal
FROM public.v_companywide_reporting_actuals
WHERE metric_type = 'invoiced'
  AND transaction_date >= '2026-01-01'
  AND transaction_date <= '2026-08-31'

UNION ALL

SELECT
  'bookings_ytd_aug_only' AS metric,
  ROUND(SUM(amount), 0)   AS ytd_goal
FROM public.v_companywide_reporting_actuals
WHERE metric_type = 'bookings'
  AND transaction_date >= '2026-08-01'
  AND transaction_date <= '2026-08-31';
