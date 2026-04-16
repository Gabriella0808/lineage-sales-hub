-- Add manager_id and extra fields to travel_log
ALTER TABLE public.travel_log ADD COLUMN manager_id UUID REFERENCES public.managers(id) ON DELETE SET NULL;
ALTER TABLE public.travel_log ADD COLUMN salesperson_name TEXT;
ALTER TABLE public.travel_log ADD COLUMN purpose TEXT;
ALTER TABLE public.travel_log ADD COLUMN approval_status TEXT;
ALTER TABLE public.travel_log ADD COLUMN travel_end_date DATE;