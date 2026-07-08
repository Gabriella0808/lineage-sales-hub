-- Backfill: push current crm_accounts fields into every linked dealers row.
-- This covers all existing accounts so the check-ins map shows the right
-- manager, rep, and contact info for accounts that were assigned before the
-- sync trigger was extended (migration 20260708002000).
UPDATE public.dealers d
SET
  name       = a.company_name,
  first_name = a.contact_first_name,
  last_name  = a.contact_last_name,
  phone      = a.main_phone,
  email      = a.email,
  website    = a.website,
  notes      = a.notes,
  manager_id = COALESCE(a.assigned_manager_id, d.manager_id),
  rep_id     = COALESCE(a.assigned_rep_id, d.rep_id)
FROM public.crm_accounts a
WHERE d.crm_account_id = a.id;
