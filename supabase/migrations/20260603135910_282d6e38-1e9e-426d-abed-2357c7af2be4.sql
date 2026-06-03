CREATE OR REPLACE FUNCTION public.dealer_daily_invoice_net(p_from date, p_to date)
RETURNS TABLE(dealer_id uuid, invoice_date date, net_total numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH headers AS (
    SELECT i.dealer_id, i.invoice_date::date AS invoice_date,
           COALESCE(SUM(i.subtotal), 0)::numeric AS amt
    FROM public.dealer_invoices i
    WHERE i.dealer_id IS NOT NULL
      AND i.invoice_date >= p_from
      AND i.invoice_date <= p_to
    GROUP BY i.dealer_id, i.invoice_date::date
  ),
  excluded AS (
    SELECT l.dealer_id, l.invoice_date::date AS invoice_date,
           COALESCE(SUM(l.extended_price), 0)::numeric AS amt
    FROM public.dealer_invoice_lines l
    WHERE l.dealer_id IS NOT NULL
      AND l.invoice_date >= p_from
      AND l.invoice_date <= p_to
      AND (
        lower(coalesce(l.sku,'')) ~ '(tariff|freight|ecsur|processing fee)'
        OR lower(coalesce(l.product_name,'')) ~ '(tariff|freight|ecsur|processing fee)'
      )
    GROUP BY l.dealer_id, l.invoice_date::date
  )
  SELECT
    COALESCE(h.dealer_id, e.dealer_id) AS dealer_id,
    COALESCE(h.invoice_date, e.invoice_date) AS invoice_date,
    (COALESCE(h.amt, 0) - COALESCE(e.amt, 0))::numeric AS net_total
  FROM headers h
  FULL OUTER JOIN excluded e
    ON e.dealer_id = h.dealer_id AND e.invoice_date = h.invoice_date;
$$;

GRANT EXECUTE ON FUNCTION public.dealer_daily_invoice_net(date, date) TO authenticated, service_role;