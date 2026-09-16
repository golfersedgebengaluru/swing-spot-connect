REVOKE ALL ON public.qc_entries FROM authenticated;
GRANT SELECT ON public.qc_entries TO authenticated;
GRANT ALL ON public.qc_entries TO service_role;