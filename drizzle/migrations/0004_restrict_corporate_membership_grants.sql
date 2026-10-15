REVOKE ALL ON public.corporate_account_members FROM anon,authenticated;
GRANT SELECT ON public.corporate_account_members TO authenticated;
GRANT ALL ON public.corporate_account_members TO service_role;
REVOKE ALL ON FUNCTION public.guard_corporate_session() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sync_linked_corporate_training() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.preserve_corporate_memberships_before_merge() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.corporate_account_cities FROM anon;
