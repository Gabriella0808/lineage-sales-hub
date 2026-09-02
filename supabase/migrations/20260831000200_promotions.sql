-- ══════════════════════════════════════════════════════════════════════════════
-- Promotion tables for Promotions > Labor Day Promo and future promotions.
--
--   public.promotions         — one row per promotion (name, dates, goal)
--   public.promotion_products — SKUs attached to each promotion
--
-- Seed: Labor Day Promo (no SKUs yet — add via Supabase dashboard or the
--       admin product table on the Promotions > Labor Day Promo page)
--
-- Do NOT change: v_portal_dealer_rep_reporting_lines, bookings, invoiced data.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── promotions ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.promotions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text        NOT NULL,
  slug                text        NOT NULL UNIQUE,
  start_date          date,
  end_date            date,
  dealer_goal_amount  numeric     NOT NULL DEFAULT 5000,
  active              boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read promotions"
  ON public.promotions FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated write promotions"
  ON public.promotions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT ON public.promotions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotions TO authenticated;
GRANT ALL ON public.promotions TO service_role;

-- ─── promotion_products ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.promotion_products (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id     uuid        NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  product_id       text,
  sku              text,
  product_name     text,
  promo_price      numeric,
  discount_percent numeric,
  active           boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotion_products_sku_or_product
    CHECK (sku IS NOT NULL OR product_id IS NOT NULL)
);

ALTER TABLE public.promotion_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read promotion_products"
  ON public.promotion_products FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated write promotion_products"
  ON public.promotion_products FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT ON public.promotion_products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotion_products TO authenticated;
GRANT ALL ON public.promotion_products TO service_role;

-- ─── Seed: Labor Day Promo ───────────────────────────────────────────────────
-- Dates left NULL — set them in the Supabase dashboard once the promo window
-- is confirmed. The reporting page handles NULL gracefully (no date filter).

INSERT INTO public.promotions (name, slug, dealer_goal_amount, active)
VALUES ('Labor Day Promo', 'labor-day-promo', 5000, true)
ON CONFLICT (slug) DO NOTHING;

NOTIFY pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════════════════
-- VALIDATION QUERIES
-- Run in Supabase SQL Editor after adding SKUs to promotion_products and
-- after the first sync / booking entries arrive.
-- Replace metric_type = 'bookings' with 'invoiced' to cross-check both modes.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Total Labor Day promo sales
-- SELECT SUM(r.amount) AS total_promo_sales
-- FROM public.v_portal_dealer_rep_reporting_lines r
-- JOIN public.promotion_products p
--   ON r.sku = p.sku OR r.sku = p.product_id
-- JOIN public.promotions pr ON pr.id = p.promotion_id
-- WHERE pr.slug = 'labor-day-promo'
--   AND p.active = true AND pr.active = true
--   AND r.metric_type = 'bookings'
--   AND (pr.start_date IS NULL OR r.transaction_date >= pr.start_date)
--   AND (pr.end_date   IS NULL OR r.transaction_date <= pr.end_date);

-- 2. Sales by rep
-- SELECT r.rep_name, SUM(r.amount) AS rep_total
-- FROM public.v_portal_dealer_rep_reporting_lines r
-- JOIN public.promotion_products p ON r.sku = p.sku OR r.sku = p.product_id
-- JOIN public.promotions pr ON pr.id = p.promotion_id
-- WHERE pr.slug = 'labor-day-promo' AND p.active AND pr.active
--   AND r.metric_type = 'bookings'
--   AND (pr.start_date IS NULL OR r.transaction_date >= pr.start_date)
--   AND (pr.end_date   IS NULL OR r.transaction_date <= pr.end_date)
-- GROUP BY r.rep_name ORDER BY rep_total DESC;

-- 3. Sales by rep / dealer
-- SELECT r.rep_name, COALESCE(r.dealer_name, r.customer_id) AS dealer,
--        r.customer_id, SUM(r.amount) AS dealer_total
-- FROM public.v_portal_dealer_rep_reporting_lines r
-- JOIN public.promotion_products p ON r.sku = p.sku OR r.sku = p.product_id
-- JOIN public.promotions pr ON pr.id = p.promotion_id
-- WHERE pr.slug = 'labor-day-promo' AND p.active AND pr.active
--   AND r.metric_type = 'bookings'
--   AND (pr.start_date IS NULL OR r.transaction_date >= pr.start_date)
--   AND (pr.end_date   IS NULL OR r.transaction_date <= pr.end_date)
-- GROUP BY r.rep_name, r.customer_id, dealer ORDER BY r.rep_name, dealer_total DESC;

-- 4. Sales by rep / dealer / SKU
-- SELECT r.rep_name, COALESCE(r.dealer_name, r.customer_id) AS dealer,
--        r.sku, SUM(r.amount) AS sku_total, COUNT(*) AS lines
-- FROM public.v_portal_dealer_rep_reporting_lines r
-- JOIN public.promotion_products p ON r.sku = p.sku OR r.sku = p.product_id
-- JOIN public.promotions pr ON pr.id = p.promotion_id
-- WHERE pr.slug = 'labor-day-promo' AND p.active AND pr.active
--   AND r.metric_type = 'bookings'
--   AND (pr.start_date IS NULL OR r.transaction_date >= pr.start_date)
--   AND (pr.end_date   IS NULL OR r.transaction_date <= pr.end_date)
-- GROUP BY r.rep_name, r.customer_id, dealer, r.sku
-- ORDER BY r.rep_name, dealer, sku_total DESC;

-- 5. Verify: page total = sum(rep totals)
-- WITH rep_totals AS (
--   SELECT r.rep_name, SUM(r.amount) AS rep_total
--   FROM public.v_portal_dealer_rep_reporting_lines r
--   JOIN public.promotion_products p ON r.sku = p.sku OR r.sku = p.product_id
--   JOIN public.promotions pr ON pr.id = p.promotion_id
--   WHERE pr.slug = 'labor-day-promo' AND p.active AND pr.active
--     AND r.metric_type = 'bookings'
--     AND (pr.start_date IS NULL OR r.transaction_date >= pr.start_date)
--     AND (pr.end_date   IS NULL OR r.transaction_date <= pr.end_date)
--   GROUP BY r.rep_name
-- )
-- SELECT SUM(rep_total) AS sum_of_rep_totals FROM rep_totals;
-- -- Must equal query 1 total.

-- 6. Verify: rep total = sum(dealer totals)
-- WITH dealer_totals AS (
--   SELECT r.rep_name, r.customer_id, SUM(r.amount) AS dealer_total
--   FROM public.v_portal_dealer_rep_reporting_lines r
--   JOIN public.promotion_products p ON r.sku = p.sku OR r.sku = p.product_id
--   JOIN public.promotions pr ON pr.id = p.promotion_id
--   WHERE pr.slug = 'labor-day-promo' AND p.active AND pr.active
--     AND r.metric_type = 'bookings'
--     AND (pr.start_date IS NULL OR r.transaction_date >= pr.start_date)
--     AND (pr.end_date   IS NULL OR r.transaction_date <= pr.end_date)
--   GROUP BY r.rep_name, r.customer_id
-- )
-- SELECT rep_name, SUM(dealer_total) AS sum_of_dealer_totals
-- FROM dealer_totals GROUP BY rep_name;
-- -- Each row must match query 2's rep_total.

-- 7. Verify: dealer total = sum(SKU totals)
-- WITH sku_totals AS (
--   SELECT r.rep_name, r.customer_id, r.sku, SUM(r.amount) AS sku_total
--   FROM public.v_portal_dealer_rep_reporting_lines r
--   JOIN public.promotion_products p ON r.sku = p.sku OR r.sku = p.product_id
--   JOIN public.promotions pr ON pr.id = p.promotion_id
--   WHERE pr.slug = 'labor-day-promo' AND p.active AND pr.active
--     AND r.metric_type = 'bookings'
--     AND (pr.start_date IS NULL OR r.transaction_date >= pr.start_date)
--     AND (pr.end_date   IS NULL OR r.transaction_date <= pr.end_date)
--   GROUP BY r.rep_name, r.customer_id, r.sku
-- )
-- SELECT rep_name, customer_id, SUM(sku_total) AS sum_of_sku_totals
-- FROM sku_totals GROUP BY rep_name, customer_id;
-- -- Each row must match query 3's dealer_total.
