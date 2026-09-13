CREATE POLICY "No direct client access"
ON public.rate_limit_attempts
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);