CREATE POLICY "Grievance officer config viewable by everyone"
ON public.admin_config
FOR SELECT
TO anon, authenticated
USING (key = ANY (ARRAY['grievance_officer_name'::text, 'grievance_officer_email'::text]));