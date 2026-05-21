CREATE OR REPLACE FUNCTION public.resolve_dealer_invoice_line_links()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  normalized_sku text;
BEGIN
  IF NEW.dealer_id IS NULL AND NEW.dealer_acctivate_id IS NOT NULL THEN
    SELECT id INTO NEW.dealer_id FROM public.dealers
     WHERE acctivate_id = NEW.dealer_acctivate_id LIMIT 1;
  END IF;
  IF NEW.invoice_id IS NULL AND NEW.invoice_acctivate_id IS NOT NULL THEN
    SELECT id INTO NEW.invoice_id FROM public.dealer_invoices
     WHERE acctivate_id = NEW.invoice_acctivate_id LIMIT 1;
  END IF;
  IF NEW.product_id IS NULL AND NEW.sku IS NOT NULL THEN
    -- Acctivate often stores SKUs as "Category:Group:SKU" with an optional
    -- " (deleted)" suffix. Strip both before matching to products.sku.
    normalized_sku := regexp_replace(NEW.sku, '\s*\(deleted\)\s*$', '');
    normalized_sku := regexp_replace(normalized_sku, '^.*:', '');
    SELECT id INTO NEW.product_id FROM public.products
     WHERE sku = normalized_sku LIMIT 1;
    IF NEW.product_id IS NULL THEN
      SELECT id INTO NEW.product_id FROM public.products
       WHERE sku = NEW.sku LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Backfill product_id on existing rows using the normalized SKU.
UPDATE public.dealer_invoice_lines il
SET product_id = p.id
FROM public.products p
WHERE il.product_id IS NULL
  AND il.sku IS NOT NULL
  AND p.sku = regexp_replace(regexp_replace(il.sku, '\s*\(deleted\)\s*$', ''), '^.*:', '');