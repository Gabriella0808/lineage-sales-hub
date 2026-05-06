DROP TRIGGER IF EXISTS set_task_board_created_by_trigger ON public.task_boards;
DROP TRIGGER IF EXISTS trg_set_task_board_created_by ON public.task_boards;

CREATE OR REPLACE FUNCTION public.set_task_board_created_by()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create a board';
  END IF;

  NEW.created_by := auth.uid();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_task_board_created_by
BEFORE INSERT ON public.task_boards
FOR EACH ROW
EXECUTE FUNCTION public.set_task_board_created_by();

DROP POLICY IF EXISTS "Signed-in users can create boards" ON public.task_boards;
DROP POLICY IF EXISTS "Users can create own boards" ON public.task_boards;

CREATE POLICY "Signed-in users can create boards"
ON public.task_boards
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);