-- ══════════════════════════════════════════════════════════════════════════════
-- Labor Day Promo (LD26) — auto-enroll dealers with LD26 bookings into the
-- participant roster, attributed to whichever rep actually booked them.
--
-- WHY: v_portal_dealer_rep_reporting_lines (metric_type='bookings',
-- discount_code='LD26') can contain bookings from dealers who used the LD26
-- code but were never manually added to labor_day_2026_participants. Both
-- the portal page and the LD26 email intentionally exclude these from
-- official totals (participant-driven, not sales-driven) — but that meant
-- real LD26 activity was going untracked instead of auto-enrolling. This
-- closes that gap: any dealer with an LD26 booking gets slotted into the
-- roster under the rep on that actual sale, going forward automatically.
--
-- Rep attribution: derived from the booking line itself (rep_id/rep_name on
-- v_portal_dealer_rep_reporting_lines), not manually assigned. If a dealer's
-- LD26 lines span more than one rep, the rep on the largest single line wins
-- (rare — bookings are normally single-rep per customer).
--
-- Safe to re-run: only inserts dealers not already on the roster
-- (NOT EXISTS + ON CONFLICT DO NOTHING against the (promo_slug, cust_id,
-- salesperson_id) unique constraint). Never modifies or removes existing
-- roster rows.
--
-- Wired into send-labor-day-promo-email's nightly run (calls this before
-- computing the report), so new LD26 dealers are auto-enrolled the same
-- night they first show up — both the email and the portal page (which
-- reads the same live table) reflect them from the next sync onward.
--
-- ── Manual run / backfill ──────────────────────────────────────────────────
--   SELECT * FROM public.sync_labor_day_participants();
--
-- ── Check what's currently unmatched (should be empty after a run) ─────────
--   SELECT s.customer_id, s.dealer_name, s.rep_name, sum(s.amount) AS total
--   FROM public.v_portal_dealer_rep_reporting_lines s
--   WHERE s.metric_type = 'bookings' AND s.discount_code = 'LD26'
--     AND NOT EXISTS (
--       SELECT 1 FROM public.labor_day_2026_participants p
--       WHERE p.promo_slug = 'ld26' AND upper(trim(p.cust_id)) = upper(trim(s.customer_id))
--     )
--   GROUP BY s.customer_id, s.dealer_name, s.rep_name;
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sync_labor_day_participants()
RETURNS TABLE (added_cust_id text, added_dealer_name text, added_rep_id text, added_rep_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH unmatched AS (
    SELECT DISTINCT ON (upper(trim(s.customer_id)))
      s.customer_id,
      s.dealer_name,
      s.rep_id,
      s.rep_name
    FROM public.v_portal_dealer_rep_reporting_lines s
    WHERE s.metric_type = 'bookings'
      AND s.discount_code = 'LD26'
      AND NULLIF(TRIM(s.customer_id), '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.labor_day_2026_participants p
        WHERE p.promo_slug = 'ld26'
          AND upper(trim(p.cust_id)) = upper(trim(s.customer_id))
      )
    ORDER BY upper(trim(s.customer_id)), s.amount DESC NULLS LAST
  ),
  inserted AS (
    INSERT INTO public.labor_day_2026_participants
      (promo_slug, cust_id, company_name, dealer_name, salesperson_id, salesperson_name, active)
    SELECT
      'ld26',
      u.customer_id,
      u.dealer_name,
      u.dealer_name,
      COALESCE(NULLIF(TRIM(u.rep_id), ''), 'unassigned'),
      COALESCE(NULLIF(TRIM(u.rep_name), ''), NULLIF(TRIM(u.rep_id), ''), 'Unassigned'),
      true
    FROM unmatched u
    ON CONFLICT (promo_slug, cust_id, salesperson_id) DO NOTHING
    RETURNING cust_id, dealer_name, salesperson_id, salesperson_name
  )
  SELECT cust_id, dealer_name, salesperson_id, salesperson_name FROM inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_labor_day_participants() TO service_role;

-- ── Backfill now — the 4 dealers currently showing in the portal's
-- "unmatched" audit panel (Michael Alan Furnishings, CYMAX STORES,
-- AFA Stores, Payless Furniture Inc) plus any others already present. ──────

SELECT * FROM public.sync_labor_day_participants();
