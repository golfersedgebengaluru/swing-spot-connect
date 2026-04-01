INSERT INTO public.admin_config (key, value) VALUES
  ('dashboard_handicap_visible', 'true'),
  ('dashboard_hours_balance_visible', 'true'),
  ('dashboard_leaderboard_rank_visible', 'true'),
  ('dashboard_reward_points_visible', 'true'),
  ('dashboard_recent_visits_visible', 'true')
ON CONFLICT DO NOTHING;