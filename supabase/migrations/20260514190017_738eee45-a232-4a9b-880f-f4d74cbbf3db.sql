
-- Dealer branding (per-user customization for customer quotes)
CREATE TABLE public.dealer_branding (
  user_id UUID PRIMARY KEY,
  company_name TEXT,
  logo_url TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_address TEXT,
  intro_message TEXT,
  footer_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dealer_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own branding" ON public.dealer_branding
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_dealer_branding_updated
  BEFORE UPDATE ON public.dealer_branding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Customer quotes (dealer -> their customer)
CREATE TABLE public.customer_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_user_id UUID NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_company TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  total NUMERIC NOT NULL DEFAULT 0,
  intro_message TEXT,
  footer_message TEXT,
  share_token TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX customer_quotes_share_token_idx ON public.customer_quotes(share_token);
CREATE INDEX customer_quotes_dealer_idx ON public.customer_quotes(dealer_user_id);

ALTER TABLE public.customer_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dealers manage own customer quotes" ON public.customer_quotes
  FOR ALL USING (auth.uid() = dealer_user_id) WITH CHECK (auth.uid() = dealer_user_id);

CREATE POLICY "Admins read all customer quotes" ON public.customer_quotes
  FOR SELECT USING (is_admin());

CREATE TRIGGER trg_customer_quotes_updated
  BEFORE UPDATE ON public.customer_quotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Customer quote items
CREATE TABLE public.customer_quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.customer_quotes(id) ON DELETE CASCADE,
  product_id UUID,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  qty NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  line_total NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX customer_quote_items_quote_idx ON public.customer_quote_items(quote_id);

ALTER TABLE public.customer_quote_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manage items of own customer quotes" ON public.customer_quote_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.customer_quotes q WHERE q.id = quote_id AND q.dealer_user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.customer_quotes q WHERE q.id = quote_id AND q.dealer_user_id = auth.uid())
  );

CREATE POLICY "Admins read all customer quote items" ON public.customer_quote_items
  FOR SELECT USING (is_admin());

-- Public read access via share_token (for customer-facing view)
-- Use a security-definer function so we don't expose the table fully
CREATE OR REPLACE FUNCTION public.get_customer_quote_by_token(_token TEXT)
RETURNS TABLE (
  id UUID,
  dealer_user_id UUID,
  customer_name TEXT,
  customer_email TEXT,
  customer_company TEXT,
  status TEXT,
  total NUMERIC,
  intro_message TEXT,
  footer_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  company_name TEXT,
  logo_url TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_address TEXT,
  items JSONB
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    q.id, q.dealer_user_id, q.customer_name, q.customer_email, q.customer_company,
    q.status, q.total, q.intro_message, q.footer_message, q.sent_at, q.created_at,
    b.company_name, b.logo_url, b.contact_email, b.contact_phone, b.contact_address,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'sku', i.sku, 'name', i.name,
        'qty', i.qty, 'unit_price', i.unit_price, 'line_total', i.line_total
      ) ORDER BY i.created_at)
      FROM public.customer_quote_items i WHERE i.quote_id = q.id),
      '[]'::jsonb
    ) AS items
  FROM public.customer_quotes q
  LEFT JOIN public.dealer_branding b ON b.user_id = q.dealer_user_id
  WHERE q.share_token = _token AND q.status <> 'draft';
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_quote_by_token(TEXT) TO anon, authenticated;

-- Storage bucket for dealer logos
INSERT INTO storage.buckets (id, name, public) VALUES ('dealer-logos', 'dealer-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read dealer logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'dealer-logos');

CREATE POLICY "Users upload own logos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'dealer-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own logos" ON storage.objects
  FOR UPDATE USING (bucket_id = 'dealer-logos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own logos" ON storage.objects
  FOR DELETE USING (bucket_id = 'dealer-logos' AND auth.uid()::text = (storage.foldername(name))[1]);
