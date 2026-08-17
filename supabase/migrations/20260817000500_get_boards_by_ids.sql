-- SECURITY DEFINER function so portal users can read board names for tasks
-- assigned to them, bypassing the task_boards RLS that otherwise restricts
-- reads to the board creator or explicit members.
CREATE OR REPLACE FUNCTION public.get_boards_by_ids(p_board_ids uuid[])
RETURNS TABLE(id uuid, name text, color text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT b.id, b.name, b.color
  FROM public.task_boards b
  WHERE b.id = ANY(p_board_ids);
$$;
