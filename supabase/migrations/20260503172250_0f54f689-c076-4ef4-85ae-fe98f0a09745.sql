CREATE UNIQUE INDEX IF NOT EXISTS dealer_sales_unique_month ON public.dealer_sales (dealer_id, year, month);
CREATE UNIQUE INDEX IF NOT EXISTS dealer_sales_lines_unique_month ON public.dealer_sales_lines (dealer_id, product_id, year, month);
CREATE UNIQUE INDEX IF NOT EXISTS products_acctivate_id_unique ON public.products (acctivate_id) WHERE acctivate_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dealers_acctivate_id_unique ON public.dealers (acctivate_id) WHERE acctivate_id IS NOT NULL;