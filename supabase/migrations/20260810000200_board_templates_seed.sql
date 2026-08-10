-- Seed built-in board templates (patch: first attempt used profiles.role which doesn't exist;
-- roles live in user_roles table).
-- Safe to re-run: checks for existence before inserting.

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
  -- Skip if built-in templates already exist
  IF EXISTS (SELECT 1 FROM public.board_templates WHERE is_builtin = true) THEN
    RETURN;
  END IF;

  SELECT r.user_id INTO v_admin_id
  FROM public.user_roles r
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
