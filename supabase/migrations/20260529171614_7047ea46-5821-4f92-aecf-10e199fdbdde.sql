UPDATE public.crm_accounts SET lifecycle_stage='closed_won' WHERE lifecycle_stage IN ('customer','dealer');
UPDATE public.crm_accounts SET lifecycle_stage='prospect' WHERE lifecycle_stage='lead';
UPDATE public.crm_accounts SET lifecycle_stage='closed_lost' WHERE lifecycle_stage='inactive';
ALTER TABLE public.crm_accounts ALTER COLUMN lifecycle_stage SET DEFAULT 'prospect';