-- Grant PostgREST access to v_portal_monthly_invoiced_actuals so the REST
-- API schema cache recognises it. Without this the client gets:
--   "Could not find the table 'public.v_portal_monthly_invoiced_actuals' in the schema cache."
GRANT SELECT ON public.v_portal_monthly_invoiced_actuals TO anon, authenticated, service_role;
