DELETE FROM public.dealer_check_ins WHERE dealer_id IN (SELECT id FROM public.dealers WHERE rep_owner = 'mateo');
DELETE FROM public.dealers WHERE rep_owner = 'mateo';