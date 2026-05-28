
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_accounts TO authenticated;
GRANT ALL ON public.crm_accounts TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_account_notes TO authenticated;
GRANT ALL ON public.crm_account_notes TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_account_stage_history TO authenticated;
GRANT ALL ON public.crm_account_stage_history TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_reps TO authenticated;
GRANT ALL ON public.sales_reps TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_reps TO authenticated;
GRANT ALL ON public.user_reps TO service_role;
