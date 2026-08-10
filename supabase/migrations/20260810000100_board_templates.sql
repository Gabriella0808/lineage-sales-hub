-- Board template library: lets users save board structures as reusable blueprints.
--
-- Three tables mirror the live board structure (task_boards / task_board_groups /
-- manager_tasks) but hold only design-time metadata — no real assignees or statuses.
--
-- create_board_from_template() copies a template into real live tables and returns
-- the new board id so the caller can navigate directly to it.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE public.board_templates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  description TEXT,
  color       TEXT,
  is_builtin  BOOLEAN     NOT NULL DEFAULT false,
  created_by  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);

CREATE TABLE public.board_template_groups (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID        NOT NULL REFERENCES public.board_templates(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  color       TEXT,
  position    INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.board_template_tasks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID        NOT NULL REFERENCES public.board_templates(id) ON DELETE CASCADE,
  group_id    UUID        REFERENCES public.board_template_groups(id) ON DELETE SET NULL,
  title       TEXT        NOT NULL,
  description TEXT,
  position    INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_board_template_groups_template ON public.board_template_groups(template_id);
CREATE INDEX idx_board_template_tasks_template  ON public.board_template_tasks(template_id);
CREATE INDEX idx_board_template_tasks_group     ON public.board_template_tasks(group_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.board_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_template_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_template_tasks  ENABLE ROW LEVEL SECURITY;

-- board_templates: view is_builtin or own; mutate only own non-builtin (admins bypass)
CREATE POLICY "View templates" ON public.board_templates
  FOR SELECT TO authenticated
  USING (archived_at IS NULL AND (is_builtin OR created_by = auth.uid() OR public.is_admin()));

CREATE POLICY "Create own templates" ON public.board_templates
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND NOT is_builtin);

CREATE POLICY "Update own templates" ON public.board_templates
  FOR UPDATE TO authenticated
  USING ((created_by = auth.uid() AND NOT is_builtin) OR public.is_admin())
  WITH CHECK ((created_by = auth.uid() AND NOT is_builtin) OR public.is_admin());

CREATE POLICY "Delete own templates" ON public.board_templates
  FOR DELETE TO authenticated
  USING ((created_by = auth.uid() AND NOT is_builtin) OR public.is_admin());

-- groups & tasks: inherit template visibility
CREATE POLICY "View template groups" ON public.board_template_groups
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.board_templates t
    WHERE t.id = template_id
      AND t.archived_at IS NULL
      AND (t.is_builtin OR t.created_by = auth.uid() OR public.is_admin())
  ));

CREATE POLICY "Manage own template groups" ON public.board_template_groups
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.board_templates t
    WHERE t.id = template_id AND (t.created_by = auth.uid() OR public.is_admin())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.board_templates t
    WHERE t.id = template_id AND (t.created_by = auth.uid() OR public.is_admin())
  ));

CREATE POLICY "View template tasks" ON public.board_template_tasks
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.board_templates t
    WHERE t.id = template_id
      AND t.archived_at IS NULL
      AND (t.is_builtin OR t.created_by = auth.uid() OR public.is_admin())
  ));

CREATE POLICY "Manage own template tasks" ON public.board_template_tasks
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.board_templates t
    WHERE t.id = template_id AND (t.created_by = auth.uid() OR public.is_admin())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.board_templates t
    WHERE t.id = template_id AND (t.created_by = auth.uid() OR public.is_admin())
  ));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.board_templates, public.board_template_groups, public.board_template_tasks
  TO authenticated;

-- ── RPC: create_board_from_template ──────────────────────────────────────────
--
-- Copies a template's group/task structure into live task_boards +
-- task_board_groups + manager_tasks rows owned by the calling user.
-- Returns the new board id.

CREATE OR REPLACE FUNCTION public.create_board_from_template(
  p_template_id uuid,
  p_board_name  text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tmpl        public.board_templates%ROWTYPE;
  v_board_id    uuid;
  v_grp         public.board_template_groups%ROWTYPE;
  v_task        public.board_template_tasks%ROWTYPE;
  v_new_grp_id  uuid;
  v_grp_map     jsonb := '{}'::jsonb;
BEGIN
  -- Validate caller can see this template
  SELECT * INTO v_tmpl
  FROM public.board_templates
  WHERE id = p_template_id
    AND archived_at IS NULL
    AND (is_builtin OR created_by = auth.uid() OR public.is_admin());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found or access denied';
  END IF;

  IF TRIM(p_board_name) = '' THEN
    RAISE EXCEPTION 'Board name cannot be blank';
  END IF;

  -- Create board
  INSERT INTO public.task_boards (name, color, created_by)
  VALUES (TRIM(p_board_name), v_tmpl.color, auth.uid())
  RETURNING id INTO v_board_id;

  -- Create groups, building an old_id → new_id map
  FOR v_grp IN
    SELECT * FROM public.board_template_groups
    WHERE template_id = p_template_id
    ORDER BY position
  LOOP
    INSERT INTO public.task_board_groups (board_id, name, color, position)
    VALUES (v_board_id, v_grp.name, v_grp.color, v_grp.position)
    RETURNING id INTO v_new_grp_id;

    v_grp_map := v_grp_map || jsonb_build_object(v_grp.id::text, v_new_grp_id::text);
  END LOOP;

  -- Create tasks in the new groups
  FOR v_task IN
    SELECT * FROM public.board_template_tasks
    WHERE template_id = p_template_id
    ORDER BY position
  LOOP
    INSERT INTO public.manager_tasks (
      title, description, status,
      board_id, group_id,
      user_id, visibility, position
    ) VALUES (
      v_task.title,
      v_task.description,
      'todo',
      v_board_id,
      CASE
        WHEN v_task.group_id IS NOT NULL
          THEN (v_grp_map ->> v_task.group_id::text)::uuid
        ELSE NULL
      END,
      auth.uid(),
      'public',
      v_task.position
    );
  END LOOP;

  RETURN v_board_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_board_from_template(uuid, text)
  TO authenticated;

-- ── Seed: built-in templates ──────────────────────────────────────────────────
--
-- Uses a placeholder created_by that the admin policy covers.
-- The service_role bypass means RLS doesn't fire for seed inserts.

DO $$
DECLARE
  v_admin_id   uuid;
  v_tmpl_id    uuid;
  v_grp_plan   uuid;
  v_grp_prod   uuid;
  v_grp_launch uuid;
  v_tmpl2_id   uuid;
  v_grp_pre    uuid;
  v_grp_onsite uuid;
  v_grp_post   uuid;
BEGIN
  -- Pick any admin as the owner of built-in templates
  SELECT u.id INTO v_admin_id
  FROM auth.users u
  JOIN public.user_roles r ON r.user_id = u.id
  WHERE r.role = 'admin'
  LIMIT 1;

  IF v_admin_id IS NULL THEN RETURN; END IF;

  -- ── Template 1: New Product Launch ─────────────────────────────────────────
  INSERT INTO public.board_templates (name, description, color, is_builtin, created_by)
  VALUES ('New Product Launch', 'Track a product from planning through launch day.', '#6366f1', true, v_admin_id)
  RETURNING id INTO v_tmpl_id;

  INSERT INTO public.board_template_groups (template_id, name, position)
  VALUES (v_tmpl_id, 'Planning',    0) RETURNING id INTO v_grp_plan;
  INSERT INTO public.board_template_groups (template_id, name, position)
  VALUES (v_tmpl_id, 'Production',  1) RETURNING id INTO v_grp_prod;
  INSERT INTO public.board_template_groups (template_id, name, position)
  VALUES (v_tmpl_id, 'Launch',      2) RETURNING id INTO v_grp_launch;

  INSERT INTO public.board_template_tasks (template_id, group_id, title, position) VALUES
    (v_tmpl_id, v_grp_plan,   'Confirm product specs & pricing',         0),
    (v_tmpl_id, v_grp_plan,   'Create dealer sell sheet / line sheet',   1),
    (v_tmpl_id, v_grp_plan,   'Set target accounts list',                2),
    (v_tmpl_id, v_grp_prod,   'Photography & 360° assets',               0),
    (v_tmpl_id, v_grp_prod,   'Upload to Acctivate & portal',            1),
    (v_tmpl_id, v_grp_prod,   'Inventory confirmation from warehouse',   2),
    (v_tmpl_id, v_grp_launch, 'Send dealer announcement email',          0),
    (v_tmpl_id, v_grp_launch, 'Brief reps on talking points',            1),
    (v_tmpl_id, v_grp_launch, 'Post launch recap',                       2);

  -- ── Template 2: Trade Show Prep ────────────────────────────────────────────
  INSERT INTO public.board_templates (name, description, color, is_builtin, created_by)
  VALUES ('Trade Show Prep', 'Pre-show, on-site, and follow-up checklist.', '#f59e0b', true, v_admin_id)
  RETURNING id INTO v_tmpl2_id;

  INSERT INTO public.board_template_groups (template_id, name, position)
  VALUES (v_tmpl2_id, 'Pre-Show',   0) RETURNING id INTO v_grp_pre;
  INSERT INTO public.board_template_groups (template_id, name, position)
  VALUES (v_tmpl2_id, 'On-Site',    1) RETURNING id INTO v_grp_onsite;
  INSERT INTO public.board_template_groups (template_id, name, position)
  VALUES (v_tmpl2_id, 'Follow-Up',  2) RETURNING id INTO v_grp_post;

  INSERT INTO public.board_template_tasks (template_id, group_id, title, position) VALUES
    (v_tmpl2_id, v_grp_pre,    'Book booth & logistics',                0),
    (v_tmpl2_id, v_grp_pre,    'Prepare samples & display',             1),
    (v_tmpl2_id, v_grp_pre,    'Print sell sheets & order forms',       2),
    (v_tmpl2_id, v_grp_pre,    'Brief reps on show goals',              3),
    (v_tmpl2_id, v_grp_onsite, 'Badge scan leads daily',                0),
    (v_tmpl2_id, v_grp_onsite, 'Note key conversations',                1),
    (v_tmpl2_id, v_grp_post,   'Enter leads in Acctivate',              0),
    (v_tmpl2_id, v_grp_post,   'Send follow-up emails within 48 hours', 1),
    (v_tmpl2_id, v_grp_post,   'Create tasks for qualified leads',      2);
END;
$$;
