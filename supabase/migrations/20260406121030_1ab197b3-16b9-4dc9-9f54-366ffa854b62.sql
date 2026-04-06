INSERT INTO public.admin_config (key, value)
VALUES ('landing_page_mode', 'community')
ON CONFLICT (key) DO NOTHING;