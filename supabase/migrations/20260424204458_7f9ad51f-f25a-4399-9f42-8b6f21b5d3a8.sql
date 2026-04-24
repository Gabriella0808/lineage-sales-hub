-- Wipe all existing dealer data so we can repopulate with Will's accounts only
DELETE FROM public.dealer_check_ins;
DELETE FROM public.dealer_sales;
DELETE FROM public.dealers;