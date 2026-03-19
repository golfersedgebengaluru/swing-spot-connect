-- Orders table for Shop checkout flow
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  items JSONB NOT NULL,
  total_price NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  city TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own orders"
  ON orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own orders"
  ON orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can read all orders"
  ON orders FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update orders"
  ON orders FOR UPDATE
  USING (has_role(auth.uid(), 'admin'));

-- Community posts table
CREATE TABLE IF NOT EXISTS community_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  content TEXT NOT NULL,
  post_type TEXT NOT NULL DEFAULT 'post',
  likes_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read community posts"
  ON community_posts FOR SELECT
  USING (true);

CREATE POLICY "Users can create own posts"
  ON community_posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own post likes"
  ON community_posts FOR UPDATE
  USING (true);

-- Transaction-derived hours balance function
CREATE OR REPLACE FUNCTION get_hours_balance(p_user_id UUID)
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(
    CASE
      WHEN type = 'purchase' THEN hours
      WHEN type = 'adjustment' THEN hours
      WHEN type = 'deduction' THEN -hours
      ELSE 0
    END
  ), 0)
  FROM hours_transactions
  WHERE user_id = p_user_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
