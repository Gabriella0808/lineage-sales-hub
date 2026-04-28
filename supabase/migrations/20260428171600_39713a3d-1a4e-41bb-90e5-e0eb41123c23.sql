
-- Update lead_date from monday "Created Date" column if missing
UPDATE public.trade_show_leads l
SET lead_date = COALESCE(
  l.lead_date,
  NULLIF((SELECT col->>'text' FROM jsonb_array_elements(l.raw->'column_values') col
          WHERE col->'column'->>'title' = 'Created Date' AND col->>'text' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' LIMIT 1), '')::date,
  l.created_at::date
);

-- Compute market name + market_id per lead based on lead_date
WITH inferred AS (
  SELECT id,
    CASE
      WHEN EXTRACT(MONTH FROM lead_date) = 1 THEN 'Atlanta Market Winter ' || EXTRACT(YEAR FROM lead_date)::int
      WHEN EXTRACT(MONTH FROM lead_date) = 7 THEN 'Atlanta Market Summer ' || EXTRACT(YEAR FROM lead_date)::int
      WHEN EXTRACT(MONTH FROM lead_date) IN (4,5) THEN 'High Point Spring ' || EXTRACT(YEAR FROM lead_date)::int
      WHEN EXTRACT(MONTH FROM lead_date) IN (10,11) THEN 'High Point Fall ' || EXTRACT(YEAR FROM lead_date)::int
      WHEN EXTRACT(MONTH FROM lead_date) = 8 THEN 'Las Vegas Market Summer ' || EXTRACT(YEAR FROM lead_date)::int
    END AS market_name
  FROM public.trade_show_leads
)
UPDATE public.trade_show_leads l
SET trade_show = COALESCE(NULLIF(l.trade_show,''), i.market_name),
    market_id = COALESCE(l.market_id, m.id)
FROM inferred i
LEFT JOIN public.trade_show_markets m ON lower(m.name) = lower(i.market_name)
WHERE l.id = i.id AND i.market_name IS NOT NULL;
