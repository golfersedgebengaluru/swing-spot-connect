-- Fix community_posts UPDATE policy: USING(true) allowed any authenticated user
-- to modify any post. Replace with ownership check.

DROP POLICY IF EXISTS "Users can update own post likes" ON public.community_posts;

-- Users can only update their own posts (e.g. to increment likes on their own content)
CREATE POLICY "Users can update own posts"
  ON public.community_posts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can update any post (e.g. for moderation)
CREATE POLICY "Admins can update any post"
  ON public.community_posts FOR UPDATE
  TO authenticated
  USING (is_admin_or_site_admin(auth.uid()));

-- Also add DELETE policies: users can delete own posts, admins can delete any
CREATE POLICY "Users can delete own posts"
  ON public.community_posts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can delete any post"
  ON public.community_posts FOR DELETE
  TO authenticated
  USING (is_admin_or_site_admin(auth.uid()));
