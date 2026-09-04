-- ══════════════════════════════════════════════════════════════════════════════
-- Add WAYFAIR, LLC to the LD26 participant roster.
--
-- WAYFAIR, LLC had LD26 bookings (rep BrandJump / rep_id 'Inter') that showed
-- up in the Labor Day Promo page's unmatched-sales audit because it wasn't in
-- the original 81-dealer participant sheet. Confirmed as a real participant —
-- adding it so its sales count toward official totals instead of being
-- flagged as unmatched.
--
-- cust_id/company_name/dealer_name use 'WAYFAIR, LLC' to match
-- v_portal_dealer_rep_reporting_lines.customer_id exactly (confirmed via the
-- unmatched-sales audit). salesperson_id/salesperson_name ('Inter' /
-- 'BrandJump') are taken from that same sales data, since BrandJump wasn't
-- previously one of the 11 rostered reps. territory/sales_manager are left
-- NULL — not supplied and not used by any goal/total calculation.
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.labor_day_2026_participants
  (promo_slug, cust_id, company_name, dealer_name, territory, sales_manager, salesperson_id, salesperson_name, active)
VALUES
  ('ld26', 'WAYFAIR, LLC', 'WAYFAIR, LLC', 'WAYFAIR, LLC', NULL, NULL, 'Inter', 'BrandJump', true)
ON CONFLICT (promo_slug, cust_id, salesperson_id) DO UPDATE SET
  company_name = EXCLUDED.company_name,
  dealer_name  = EXCLUDED.dealer_name,
  active       = EXCLUDED.active,
  updated_at   = now();

NOTIFY pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION — expect 82 participants / 82 dealers / 12 reps after this migration
-- ══════════════════════════════════════════════════════════════════════════════

-- select count(*) as participants, count(distinct cust_id) as dealers,
--        count(distinct salesperson_id) as reps
-- from public.labor_day_2026_participants
-- where promo_slug = 'ld26' and active = true;
