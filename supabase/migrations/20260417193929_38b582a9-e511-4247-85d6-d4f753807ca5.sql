ALTER TABLE public.sign_in_log REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sign_in_log;