-- Backfill orphan RCB legacy league team registrations (captain roster missing,
-- invites missing, league_* mirror not populated) caused by webhook path not
-- running the full post-insert finalization.

INSERT INTO public.legacy_league_team_members (team_registration_id, league_id, user_id, role, joined_via)
VALUES
  ('bf3d983b-c897-4d23-80e8-ff6abacca100', '154470f9-4c7e-4f9e-89bb-e1224b23e80d', '5b85e957-6af8-4a58-91e4-cb9b92bdcdfa', 'captain', 'captain'),
  ('6ba08658-c613-4bda-a3e7-d21562da4403', 'b61065f5-9eac-45e5-8dc7-e1ad6afc793b', '5b85e957-6af8-4a58-91e4-cb9b92bdcdfa', 'captain', 'captain')
ON CONFLICT DO NOTHING;

INSERT INTO public.legacy_league_team_invites (team_registration_id, league_id, email, invited_by, status)
VALUES
  ('bf3d983b-c897-4d23-80e8-ff6abacca100', '154470f9-4c7e-4f9e-89bb-e1224b23e80d', 'yashasankam@gmail.com', '5b85e957-6af8-4a58-91e4-cb9b92bdcdfa', 'pending'),
  ('6ba08658-c613-4bda-a3e7-d21562da4403', 'b61065f5-9eac-45e5-8dc7-e1ad6afc793b', 'yashasankam@gmail.com', '5b85e957-6af8-4a58-91e4-cb9b92bdcdfa', 'pending')
ON CONFLICT DO NOTHING;

SELECT public.promote_legacy_team_member('bf3d983b-c897-4d23-80e8-ff6abacca100'::uuid, '5b85e957-6af8-4a58-91e4-cb9b92bdcdfa'::uuid);
SELECT public.promote_legacy_team_member('6ba08658-c613-4bda-a3e7-d21562da4403'::uuid, '5b85e957-6af8-4a58-91e4-cb9b92bdcdfa'::uuid);