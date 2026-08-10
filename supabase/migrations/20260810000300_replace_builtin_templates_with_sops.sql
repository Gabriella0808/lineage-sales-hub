-- Replace the placeholder built-in templates (New Product Launch, Trade Show Prep)
-- with real SOP templates sourced from the live SOP boards.
--
-- Boards converted to templates:
--   SOP - Product New Intro    (5cf7dfa9-05ed-48fc-9b8a-15756a142464)
--   SOP - Sales Promotions     (654d560b-0b19-47d9-89cd-ae0fe539c94c)
--   SOP - Rep Hiring           (f9f17dc6-df5b-48fc-9515-9e67ba998303)
--   SOP - Product Closeouts    (d3f13586-1e17-4d14-b5b3-f7648cddc3ec)

DO $$
DECLARE
  v_admin_id uuid;

  -- template ids
  v_t1 uuid; v_t2 uuid; v_t3 uuid; v_t4 uuid;

  -- group ids - template 1 (Product New Intro)
  v_g1a uuid; v_g1b uuid;

  -- group ids - template 2 (Sales Promotions)
  v_g2a uuid; v_g2b uuid; v_g2c uuid; v_g2d uuid;

  -- group ids - template 3 (Rep Hiring)
  v_g3a uuid; v_g3b uuid; v_g3c uuid; v_g3d uuid;

  -- group ids - template 4 (Product Closeouts)
  v_g4a uuid; v_g4b uuid; v_g4c uuid; v_g4d uuid;

BEGIN
  -- ── Remove old placeholder built-ins ───────────────────────────────────────
  DELETE FROM public.board_templates
  WHERE is_builtin = true
    AND name IN ('New Product Launch', 'Trade Show Prep');

  -- ── Admin owner ────────────────────────────────────────────────────────────
  SELECT r.user_id INTO v_admin_id
  FROM public.user_roles r
  WHERE r.role = 'admin'
  LIMIT 1;

  IF v_admin_id IS NULL THEN RETURN; END IF;

  -- ════════════════════════════════════════════════════════════════════════════
  -- TEMPLATE 1 - SOP: Product New Intro
  -- ════════════════════════════════════════════════════════════════════════════
  INSERT INTO public.board_templates (name, description, color, is_builtin, created_by)
  VALUES (
    'SOP - Product New Intro',
    'End-to-end checklist for launching a new product line: admin, marketing, sales, and internet tasks.',
    '#ef4444', true, v_admin_id
  ) RETURNING id INTO v_t1;

  INSERT INTO public.board_template_groups (template_id, name, position)
  VALUES (v_t1, 'Acctivate SOP Checklist', 0) RETURNING id INTO v_g1a;

  INSERT INTO public.board_template_groups (template_id, name, position)
  VALUES (v_t1, 'Launch Tasks', 1) RETURNING id INTO v_g1b;

  INSERT INTO public.board_template_tasks (template_id, group_id, title, position) VALUES
    (v_t1, v_g1a, 'Acctivate Checklist - please review the attached document', 0);

  INSERT INTO public.board_template_tasks (template_id, group_id, title, position) VALUES
    (v_t1, v_g1b, 'ProductDev: Formulate Pricing',                                                        1000),
    (v_t1, v_g1b, 'ProductDev: Create Competitive Pricing Analysis to Send to Reps',                      2000),
    (v_t1, v_g1b, 'Admin: Set up Product in QB',                                                          3000),
    (v_t1, v_g1b, 'Admin: Order Inventory',                                                                4000),
    (v_t1, v_g1b, 'Admin: Order Spare Parts and Wood Samples for Reps (4x4 as needed)',                   5000),
    (v_t1, v_g1b, 'Admin: HTS Codes - communicate with factory, add to Acctivate, check with broker',    6000),
    (v_t1, v_g1b, 'Marketing: Add Product Line to AMP',                                                   7000),
    (v_t1, v_g1b, 'Marketing: Update Price List(s)',                                                       8000),
    (v_t1, v_g1b, 'Marketing: Add Product Line to Inv Available Report',                                  9000),
    (v_t1, v_g1b, 'Marketing: Educate Customer Service on New Products',                                  10000),
    (v_t1, v_g1b, 'Admin: Update Container Ordering Spreadsheet',                                         11000),
    (v_t1, v_g1b, 'Sales: Assign Sales Goals to Each Rep Group',                                          12000),
    (v_t1, v_g1b, 'Marketing: List of Target Placements in Dealerships',                                  13000),
    (v_t1, v_g1b, 'Sales: Work on Launch Program with Each Group',                                        14000),
    (v_t1, v_g1b, 'Sales: Create Sales Incentive Program for New Product Line',                           15000),
    (v_t1, v_g1b, 'Marketing: Schedule Overseas Photoshoot',                                              16000),
    (v_t1, v_g1b, 'Marketing: Photo reqs - angled shots/silos, group shot, lifestyle, line drawings, video', 17000),
    (v_t1, v_g1b, 'Marketing: Complete Infographics for BrandJump',                                       18000),
    (v_t1, v_g1b, 'Marketing: Add Pictures to Dropbox for Reps',                                          19000),
    (v_t1, v_g1b, 'Marketing: Add Product Line to Website(s)',                                            20000),
    (v_t1, v_g1b, 'Marketing: Create Mailchimp Implementation Program',                                   21000),
    (v_t1, v_g1b, 'Marketing: One Page POS Sheet',                                                        22000),
    (v_t1, v_g1b, 'Marketing: Send to Buying Groups - All POS for New Intros',                            23000),
    (v_t1, v_g1b, 'Marketing: Create Sell Sheets for Digital Catalog',                                    24000),
    (v_t1, v_g1b, 'Marketing: Video - construction, design and selling proposition',                      25000),
    (v_t1, v_g1b, 'Internet: Add to Product Data Template with Romantic Commentary',                      26000),
    (v_t1, v_g1b, 'Internet: Update All Internet Dealer Templates',                                       27000),
    (v_t1, v_g1b, 'Internet: Add Product Line to Internet Dealers',                                       28000),
    (v_t1, v_g1b, 'Sales: Schedule Road Shows',                                                           29000);

  -- ════════════════════════════════════════════════════════════════════════════
  -- TEMPLATE 2 - SOP: Sales Promotions
  -- ════════════════════════════════════════════════════════════════════════════
  INSERT INTO public.board_templates (name, description, color, is_builtin, created_by)
  VALUES (
    'SOP - Sales Promotions',
    'Step-by-step checklist for running a seasonal dealer promotion from kickoff to results review.',
    '#6366f1', true, v_admin_id
  ) RETURNING id INTO v_t2;

  INSERT INTO public.board_template_groups (template_id, name, position)
  VALUES (v_t2, 'To Do',       0) RETURNING id INTO v_g2a;
  INSERT INTO public.board_template_groups (template_id, name, position)
  VALUES (v_t2, 'In Progress', 1) RETURNING id INTO v_g2b;
  INSERT INTO public.board_template_groups (template_id, name, position)
  VALUES (v_t2, 'Stuck',       2) RETURNING id INTO v_g2c;
  INSERT INTO public.board_template_groups (template_id, name, position)
  VALUES (v_t2, 'Done',        3) RETURNING id INTO v_g2d;

  INSERT INTO public.board_template_tasks (template_id, group_id, title, position) VALUES
    (v_t2, v_g2a, 'Give reps notice 6 weeks in advance with exact promo dates',                           1000),
    (v_t2, v_g2a, 'Create marketing assets for dealers to advertise (web banners, social media, etc.)',   2000),
    (v_t2, v_g2a, 'Decide how many participants each rep can have from their territory',                   3000),
    (v_t2, v_g2a, 'Collect participant lists from reps',                                                   4000),
    (v_t2, v_g2a, 'Compare dealer names to last promo - confirm each is worthy of participating',         5000),
    (v_t2, v_g2a, 'Agree on final list for each rep',                                                     6000),
    (v_t2, v_g2a, 'Submit to Customer Service (Excel workbook, one tab per rep)',                         7000),
    (v_t2, v_g2a, 'Ensure rep portal shows active promo numbers by dealer',                               8000),
    (v_t2, v_g2a, 'Mid-promo: check in with reps on dealers that haven''t ordered; push follow-through', 9000),
    (v_t2, v_g2a, 'Report final results to the team',                                                     10000),
    (v_t2, v_g2a, 'Review final results as a team; communicate with reps that were unsuccessful',         11000);

  -- ════════════════════════════════════════════════════════════════════════════
  -- TEMPLATE 3 - SOP: Rep Hiring
  -- ════════════════════════════════════════════════════════════════════════════
  INSERT INTO public.board_templates (name, description, color, is_builtin, created_by)
  VALUES (
    'SOP - Rep Hiring',
    'Complete onboarding checklist when hiring a new sales rep: admin, materials, sales setup, and scheduling.',
    '#ef4444', true, v_admin_id
  ) RETURNING id INTO v_t3;

  INSERT INTO public.board_template_groups (template_id, name, position)
  VALUES (v_t3, 'To Do',       0) RETURNING id INTO v_g3a;
  INSERT INTO public.board_template_groups (template_id, name, position)
  VALUES (v_t3, 'In Progress', 1) RETURNING id INTO v_g3b;
  INSERT INTO public.board_template_groups (template_id, name, position)
  VALUES (v_t3, 'Stuck',       2) RETURNING id INTO v_g3c;
  INSERT INTO public.board_template_groups (template_id, name, position)
  VALUES (v_t3, 'Done',        3) RETURNING id INTO v_g3d;

  INSERT INTO public.board_template_tasks (template_id, group_id, title, position) VALUES
    (v_t3, v_g3a, 'Admin: Execute Rep Contract',                                                          1),
    (v_t3, v_g3a, 'Admin: W-9 / ACH',                                                                    2),
    (v_t3, v_g3a, 'Admin: Add Rep to QB',                                                                 3),
    (v_t3, v_g3a, 'Admin: Create Customer Account for Rep (Samples)',                                     4),
    (v_t3, v_g3a, 'Admin: Create Vendor Account for Rep',                                                 5),
    (v_t3, v_g3a, 'Admin: Active Accounts / Rep Reports to Utilize',                                     6),
    (v_t3, v_g3a, 'Admin: Get Additions to Focus Group',                                                  7),
    (v_t3, v_g3a, 'Admin: Add to Outlook (reps and focus group)',                                        8),
    (v_t3, v_g3a, 'Admin: Add to Mailchimp as "1"',                                                      9),
    (v_t3, v_g3a, 'Admin: Update Rep Contact Info in Word and Circulate to CS',                          10),
    (v_t3, v_g3a, 'Admin: Internal Email to All Stakeholders Introducing Rep',                           11),
    (v_t3, v_g3a, 'Admin: Setup Zoom to Introduce to Internal Team',                                     12),
    (v_t3, v_g3a, 'Admin: Invite to AMP',                                                                13),
    (v_t3, v_g3a, 'Admin: Invite to Dropbox',                                                            14),
    (v_t3, v_g3a, 'Materials: Order Business Cards',                                                     15),
    (v_t3, v_g3a, 'Materials: Mail Catalogs (align with kick-off trip)',                                 16),
    (v_t3, v_g3a, 'Sales: Review Territory Goals and Get Feedback from New Rep',                         17),
    (v_t3, v_g3a, 'Sales: Cover Catalog and Summarize Each Collection',                                  18),
    (v_t3, v_g3a, 'Sales: Schedule 1 Hour Review - Territory, Products, Intro to CS',                   19),
    (v_t3, v_g3a, 'Sales: Get Samples (NS or LUX) - align with kick-off trip',                          20),
    (v_t3, v_g3a, 'Sales: Notify re buying groups; send list of dealers in territory',                   21),
    (v_t3, v_g3a, 'Sales: Set KPI Goals and Update KPI Report',                                          22),
    (v_t3, v_g3a, 'Sales: Plan Travel - must be within 1st month of hiring',                             23);

  -- ════════════════════════════════════════════════════════════════════════════
  -- TEMPLATE 4 - SOP: Product Closeouts
  -- ════════════════════════════════════════════════════════════════════════════
  INSERT INTO public.board_templates (name, description, color, is_builtin, created_by)
  VALUES (
    'SOP - Product Closeouts',
    'Checklist for discontinuing a product line: admin, marketing, and internet updates.',
    '#ef4444', true, v_admin_id
  ) RETURNING id INTO v_t4;

  INSERT INTO public.board_template_groups (template_id, name, position)
  VALUES (v_t4, 'To Do',       0) RETURNING id INTO v_g4a;
  INSERT INTO public.board_template_groups (template_id, name, position)
  VALUES (v_t4, 'In Progress', 1) RETURNING id INTO v_g4b;
  INSERT INTO public.board_template_groups (template_id, name, position)
  VALUES (v_t4, 'Stuck',       2) RETURNING id INTO v_g4c;
  INSERT INTO public.board_template_groups (template_id, name, position)
  VALUES (v_t4, 'Done',        3) RETURNING id INTO v_g4d;

  INSERT INTO public.board_template_tasks (template_id, group_id, title, position) VALUES
    (v_t4, v_g4a, 'Admin: Change to C in QB (min 0, sales acct = closeouts, discount price, commish 3%)', 1),
    (v_t4, v_g4a, 'Admin: Remove from Container Ordering Spreadsheet',                                    2),
    (v_t4, v_g4a, 'Admin: Tell Miranda to Get Rid of Relevant Spare Parts Once Product Is Gone',         3),
    (v_t4, v_g4a, 'Marketing: Change in AMP',                                                             4),
    (v_t4, v_g4a, 'Marketing: Update QQube',                                                              5),
    (v_t4, v_g4a, 'Marketing: Remove from Price List',                                                    6),
    (v_t4, v_g4a, 'Marketing: Add to Closeout Flyer',                                                     7),
    (v_t4, v_g4a, 'Marketing: Blast on Mailchimp Announcing Closeout',                                   8),
    (v_t4, v_g4a, 'Marketing: Email Reps',                                                                9),
    (v_t4, v_g4a, 'Marketing: Let CS Know',                                                              10),
    (v_t4, v_g4a, 'Marketing: Remove from Website Once Qty Is Gone',                                    11),
    (v_t4, v_g4a, 'Internet: Update BrandJump Template',                                                 12),
    (v_t4, v_g4a, 'Internet: Update All Internet Dealer Templates',                                      13);

END;
$$;
