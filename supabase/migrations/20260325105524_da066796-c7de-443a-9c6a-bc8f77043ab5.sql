
-- Allow authenticated users to insert their own revenue transactions (for payment recording)
CREATE POLICY "Users can insert own revenue_transactions" ON public.revenue_transactions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
