ALTER TABLE public.manager_tasks REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.manager_tasks;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;