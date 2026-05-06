CREATE OR REPLACE FUNCTION public.set_task_board_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.created_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_task_board_created_by ON public.task_boards;
CREATE TRIGGER trg_set_task_board_created_by
BEFORE INSERT ON public.task_boards
FOR EACH ROW
EXECUTE FUNCTION public.set_task_board_created_by();

DROP POLICY IF EXISTS "Create own boards" ON public.task_boards;
CREATE POLICY "Signed-in users can create boards"
ON public.task_boards
FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());