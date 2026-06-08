DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated;',
      t.table_name
    );
    EXECUTE format(
      'GRANT ALL ON public.%I TO service_role;',
      t.table_name
    );
  END LOOP;
END $$;