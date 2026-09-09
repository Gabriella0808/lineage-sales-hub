-- ══════════════════════════════════════════════════════════════════════════════
-- Fix the backfill write method: acctivate_invoice_lines_2026_direct has no
-- unique constraint/index on guid_invoice_detail (only on natural_key), so
-- the script's POST upsert with on_conflict=guid_invoice_detail was invalid
-- from Postgres's side — PostgREST can't build an ON CONFLICT clause without
-- a matching unique constraint, hence the 400 Bad Request on every batch.
--
-- FIX: a plain UPDATE-only RPC, no upsert, no ON CONFLICT, so it can never
-- insert a row regardless of constraints. Matches on the normalized GUID
-- form (lowercase, dashes and braces stripped) on both sides so it's immune
-- to the casing/format mismatch already fixed once in the PowerShell script
-- — this makes that normalization a server-side guarantee too, not just a
-- client-side one.
--
-- Hardcodes the July 2026 date range in the WHERE clause (not a parameter)
-- so the scope guarantee lives in the database, not just in the caller —
-- this RPC physically cannot touch any row outside July 2026 no matter what
-- the caller passes. Only ever writes original_price; every other column is
-- untouched. SECURITY DEFINER, but EXECUTE is restricted to service_role
-- only — this is a targeted backfill tool, not a general-purpose write path.
--
-- Untouched: bookings, Open SO/backlog, Labor Day Promo, formula_net_amount,
-- price, invoice_detail_amount, the invoice formula views from
-- 20260913000700/20260913000800, Dealer/Rep Reporting, Live KPI.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.backfill_july_2026_invoice_original_price(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_updated_count integer;
BEGIN
  WITH payload AS (
    SELECT
      lower(replace(replace(replace(elem->>'normalized_guid', '{', ''), '}', ''), '-', '')) AS normalized_guid,
      (elem->>'original_price')::numeric AS original_price
    FROM jsonb_array_elements(p_rows) AS elem
    WHERE NULLIF(TRIM(elem->>'normalized_guid'), '') IS NOT NULL
      AND elem->>'original_price' IS NOT NULL
  ),
  updated AS (
    UPDATE public.acctivate_invoice_lines_2026_direct t
    SET original_price = p.original_price
    FROM payload p
    WHERE lower(replace(t.guid_invoice_detail, '-', '')) = p.normalized_guid
      AND t.invoice_date >= '2026-07-01'
      AND t.invoice_date < '2026-08-01'
    RETURNING t.guid_invoice_detail
  )
  SELECT count(*) INTO v_updated_count FROM updated;

  RETURN v_updated_count;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_july_2026_invoice_original_price(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_july_2026_invoice_original_price(jsonb) TO service_role;

COMMENT ON FUNCTION public.backfill_july_2026_invoice_original_price(jsonb) IS
  'One-time backfill helper for scripts/acctivate-sync/backfill-july-invoice-original-price.ps1. UPDATE-only (never INSERT), writes only original_price, hard-scoped to July 2026 invoice_date in the WHERE clause. p_rows: jsonb array of {normalized_guid, original_price}. Returns count of rows actually updated.';

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION
--
-- 1. Function exists, UPDATE-only, no ON CONFLICT / INSERT anywhere in its body:
--    SELECT prosecdef, pg_get_functiondef(oid) FROM pg_proc
--    WHERE proname = 'backfill_july_2026_invoice_original_price';
--
-- 2. Manual smoke test with a single known guid (safe — WHERE clause still
--    requires an exact match, no-op if the guid/date don't line up):
--    SELECT public.backfill_july_2026_invoice_original_price(
--      '[{"normalized_guid": "95b657dcaef6428fac8701291c43b63f", "original_price": 123.45}]'::jsonb
--    );
--
-- 3. Confirm only service_role can execute:
--    SELECT grantee, privilege_type FROM information_schema.role_routine_grants
--    WHERE routine_name = 'backfill_july_2026_invoice_original_price';
-- ══════════════════════════════════════════════════════════════════════════════
