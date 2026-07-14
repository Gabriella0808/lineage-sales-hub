-- 1. Fix trigger function: NEW.id doesn't exist on task_board_members (PK is board_id, user_id).
--    Pass boardId / userId / addedBy to match what notify-board-subscribed expects.
CREATE OR REPLACE FUNCTION public.notify_board_subscribed_on_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://tcqpseblcwqjopbocfmr.supabase.co/functions/v1/notify-board-subscribed',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'boardId',  NEW.board_id,
      'userId',   NEW.user_id,
      'addedBy',  NEW.added_by
    )
  );
  RETURN NEW;
END;
$$;

-- 2. Fix RLS: drop the FOR ALL creator-only policy and replace with granular ones.
--    Any authenticated portal user can now add subscribers; only the creator can remove them.
DROP POLICY IF EXISTS "Board creator manages members" ON public.task_board_members;
DROP POLICY IF EXISTS "Members can add subscribers"   ON public.task_board_members;

CREATE POLICY "Board creator can view all members"
ON public.task_board_members FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.task_boards b
          WHERE b.id = task_board_members.board_id
            AND b.created_by = auth.uid())
);

CREATE POLICY "Authenticated users can add subscribers"
ON public.task_board_members FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Board creator can remove members"
ON public.task_board_members FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.task_boards b
          WHERE b.id = task_board_members.board_id
            AND b.created_by = auth.uid())
);
