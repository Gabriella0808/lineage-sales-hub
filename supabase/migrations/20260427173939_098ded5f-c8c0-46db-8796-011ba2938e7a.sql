ALTER TABLE public.dealer_check_ins REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dealer_check_ins;