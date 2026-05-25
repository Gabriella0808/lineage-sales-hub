-- 1) Remove anon read on sensitive tables
DROP POLICY IF EXISTS "Allow anon read inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow anon read kpi_records" ON public.kpi_records;

-- 2) Restrict performance reviews to admins only
DROP POLICY IF EXISTS "Authenticated read reviews" ON public.org_position_reviews;
CREATE POLICY "Admins read reviews"
ON public.org_position_reviews
FOR SELECT
TO authenticated
USING (public.is_admin());

-- 3) Revoke API access on materialized view
REVOKE ALL ON public.dealer_monthly_invoice_totals FROM anon, authenticated;

-- 4) Pin search_path on remaining functions
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;