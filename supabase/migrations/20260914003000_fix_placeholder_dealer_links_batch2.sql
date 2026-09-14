-- ══════════════════════════════════════════════════════════════════════════════
-- Generalizing the Jordan Shindell dealer-roster fix: 2 more dealers linked
-- to a placeholder sales_reps row (blank acctivate_id) where the real
-- transaction rep_id maps unambiguously to an EXISTING real sales_reps row.
--
-- Diagnosed across every rep code (Jul 1 - today, invoices): ~15 rep codes
-- showed a Dealer Reporting vs Rep Reporting mismatch. Only these 2 dealers
-- fit the exact Jordan pattern (Category A: placeholder link + single clear
-- real-rep code + that real row already exists). The rest are held back for
-- explicit review - they need a different kind of fix (correcting a
-- sales_reps.acctivate_id value, or reassigning a dealer already linked to
-- a different real/active rep), neither of which is a "dealer.rep_id ->
-- existing real sales_reps row" fix, so out of scope here:
--   - ~$68k across 16 dealers linked to placeholder "Andrew Smith" (real
--     transaction code 'smith') - no sales_reps row with that acctivate_id
--     exists yet, so there is nothing safe to redirect to.
--   - "Accomodation Sale" -> placeholder "Accomodation" (code 'accom') -
--     same issue, no real target row.
--   - Rep-code drift where roster and live transactions disagree on the
--     SAME real person (kate vs jones, beyer vs il-wi).
--   - Dealers actively linked to a different real/House rep than recent
--     transactions show (Lott's Furniture, Rock's Carolina Furniture,
--     Walker Furniture, Faire Wholesale, Brooks Furniture Express) - could
--     be stale roster or a legitimate recent reassignment; not distinguishable
--     from data alone.
--   - "house" and "inter"/BrandJump - large mismatches that look structural
--     (catch-all / umbrella accounts), not simple broken links.
--
-- Only rep_id changes on these 2 rows - territory, manager_id, and every
-- other dealer field are untouched, not invented, not derived from
-- rep_territories, matching the same constraint as the Jordan fix.
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE public.dealers SET rep_id = 'd760d46a-3678-4938-80e4-ad87bd6ee129' -- Sergi / Sergio Hospitality
WHERE acctivate_id = 'KLUGMANENT';

UPDATE public.dealers SET rep_id = '7a98ca2c-c6aa-4541-b680-cbc5485f3cc3' -- BradR / Brad Robertson
WHERE acctivate_id = 'Belfort Furniture Inc';

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- select round(sum(primary_amt),2) from get_sales_reporting_grouped_rows(
--   'invoiced','dealer','2026-07-01', current_date, NULL,NULL,NULL,NULL,NULL,
--   ARRAY['sergi'], NULL);
-- -- expect to rise by ~27537.00, closing most of Sergio Hospitality's gap
--
-- select round(sum(primary_amt),2) from get_sales_reporting_grouped_rows(
--   'invoiced','dealer','2026-07-01', current_date, NULL,NULL,NULL,NULL,NULL,
--   ARRAY['bradr'], NULL);
-- -- expect to rise by ~5607.00, closing most of Brad Robertson's gap
-- ══════════════════════════════════════════════════════════════════════════════
