-- ══════════════════════════════════════════════════════════════════════════════
-- Backfill dealers whose invoiced revenue was excluded from Dealer Reporting
-- because they don't match the active-dealer roster predicate
-- (source <> 'field_only' AND (salesperson <> '' OR territory <> '')).
--
-- WHY: Live KPI totals all invoiced revenue unconditionally; Dealer Reporting
-- is deliberately roster-driven (per prior request) and excludes anyone not
-- on the roster. That gap was flagged when Dealer Reporting was rebuilt, and
-- confirmed again now: $248,922.98 across 33 real, named dealers (July 2026
-- onward, invoiced) — Jordan's Furniture, McLaughlin's Home Furnishings,
-- Surroundings, Talsma Furniture, etc. — all with real rep attribution in
-- the actual invoice lines, just missing/incomplete in public.dealers.
--
-- FIX: upsert one dealers row per unmatched customer_id, keyed on the REAL
-- Acctivate CustId (= customer_id from the invoice lines — not a
-- portal-generated UUID), with salesperson populated from that dealer's
-- largest invoiced line's rep. Only touches:
--   - a NEW row, if no dealers row has this acctivate_id at all, or
--   - an EXISTING row's salesperson field, and only when it's currently
--     blank (COALESCE keeps whatever is already there otherwise).
-- Never deletes or overwrites a populated salesperson/territory, never
-- touches any other dealers column, never removes a row.
--
-- salesperson text flows through the existing resolve_dealer_acctivate_links()
-- trigger (unchanged, already relied on by the normal Acctivate sync) which
-- strips a trailing "(XX)" territory suffix and resolves/auto-creates the
-- matching sales_reps row — same mechanism, not new behavior.
--
-- Scope: invoiced, July 2026 onward only — matches exactly what was measured
-- and reported. The same gap likely exists for bookings too; not touched
-- here (separate, out of scope for this fix — ask if you want it run there
-- too).
-- ══════════════════════════════════════════════════════════════════════════════

WITH unmatched AS (
  SELECT DISTINCT ON (upper(trim(a.customer_id::text)))
    a.customer_id,
    a.dealer_name,
    a.rep_name
  FROM public.v_portal_dealer_rep_reporting_lines a
  WHERE a.metric_type = 'invoiced'
    AND a.transaction_date >= '2026-07-01'
    AND NULLIF(TRIM(a.customer_id::text), '') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.dealers d
      WHERE d.source <> 'field_only'
        AND (NULLIF(TRIM(d.salesperson), '') IS NOT NULL OR NULLIF(TRIM(d.territory), '') IS NOT NULL)
        AND lower(trim(d.acctivate_id)) = lower(trim(a.customer_id::text))
    )
  ORDER BY upper(trim(a.customer_id::text)), a.amount DESC NULLS LAST
)
INSERT INTO public.dealers (acctivate_id, name, salesperson, source)
SELECT
  u.customer_id,
  COALESCE(NULLIF(TRIM(u.dealer_name), ''), u.customer_id),
  NULLIF(TRIM(u.rep_name), ''),
  'acctivate'
FROM unmatched u
ON CONFLICT (acctivate_id) DO UPDATE SET
  salesperson = COALESCE(NULLIF(TRIM(dealers.salesperson), ''), EXCLUDED.salesperson),
  updated_at  = now()
WHERE NULLIF(TRIM(dealers.salesperson), '') IS NULL
  AND NULLIF(TRIM(dealers.territory), '') IS NULL;

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- 1. Gap should now be closed — both totals should match:
--    SELECT round(sum(amount),2) AS unscoped_total
--    FROM public.v_portal_dealer_rep_reporting_lines
--    WHERE metric_type = 'invoiced' AND transaction_date >= '2026-07-01';
--
--    SELECT round(sum(primary_amt),2) AS dealer_reporting_total
--    FROM public.get_sales_reporting_grouped_rows('invoiced','dealer','2026-01-01','2026-12-31',NULL,NULL,NULL,NULL,NULL,NULL,NULL);
--
-- 2. Confirm each of the 33 now resolves to a real rep:
--    SELECT d.acctivate_id, d.name, d.salesperson, sr.name AS resolved_rep
--    FROM public.dealers d
--    LEFT JOIN public.sales_reps sr ON sr.id = d.rep_id
--    WHERE d.acctivate_id IN ('Jordan''s Furniture','McLaughlin''s Home Furnishings','Surroundings','Talsma Furniture')
--    ORDER BY d.name;
-- ══════════════════════════════════════════════════════════════════════════════
