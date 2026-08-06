-- Returns every distinct (rep_name, rep_id) pair that appears in
-- v_portal_dealer_rep_reporting_lines (both bookings and invoiced branches).
--
-- Used by the Live KPI frontend to resolve display-name dropdown selections to
-- the exact identifiers stored in Acctivate, enabling stable rep_id-based
-- filtering instead of fragile display-name string matching.
--
-- SECURITY DEFINER so the invoiced branch (portal_acctivate_invoices via
-- get_portal_invoiced_lines) is readable without RLS for the calling user.
--
-- ── Apply ─────────────────────────────────────────────────────────────────────
--   Paste and run in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_distinct_rep_identifiers()
RETURNS TABLE(rep_name text, rep_id text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT rep_name, rep_id
  FROM   public.v_portal_dealer_rep_reporting_lines
  WHERE  rep_name IS NOT NULL
    AND  rep_name NOT IN ('Unassigned', '')
    AND  rep_id   IS NOT NULL
    AND  rep_id   NOT IN ('', 'Unassigned')
  ORDER  BY rep_name
$$;

GRANT EXECUTE ON FUNCTION public.get_distinct_rep_identifiers() TO anon, authenticated;
