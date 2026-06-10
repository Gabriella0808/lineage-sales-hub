ALTER TABLE public.crm_accounts ADD COLUMN brands text[] NOT NULL DEFAULT '{}';
UPDATE public.crm_accounts SET brands = ARRAY[brand] WHERE brand IS NOT NULL AND brand <> '';