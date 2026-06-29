INSERT INTO public.user_roles (user_id, role)
SELECT um.user_id, 'manager'::app_role
FROM public.user_managers um
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = um.user_id AND ur.role = 'manager'
);