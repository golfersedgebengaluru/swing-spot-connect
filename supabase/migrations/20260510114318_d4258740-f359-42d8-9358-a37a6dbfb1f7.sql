DELETE FROM public.user_roles WHERE user_id='34c5f760-a2ad-40b1-8d2a-2fd4435713cd' AND role='admin';
INSERT INTO public.leagues_only_admins (user_id) VALUES ('34c5f760-a2ad-40b1-8d2a-2fd4435713cd') ON CONFLICT (user_id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role) VALUES ('34c5f760-a2ad-40b1-8d2a-2fd4435713cd', 'site_admin') ON CONFLICT (user_id, role) DO NOTHING;