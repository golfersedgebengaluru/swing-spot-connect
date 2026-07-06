-- One-off cleanup: purge orphaned artefacts from the deleted "Testy B" team
-- (league 1cf198e0-9076-4ece-a505-77312611fc26). The team + legacy registration
-- were removed earlier, but per-user score rows and activity-feed events keyed
-- by user_id remained visible in the users' account view.
DELETE FROM public.league_scores
WHERE league_id = '1cf198e0-9076-4ece-a505-77312611fc26'
  AND player_id IN (
    'cf9fc542-c918-44ed-ab4c-734203737514', -- Bharath
    'f237ba60-de3e-41f5-9272-81951c70c4db'  -- Hari (former Testy B captain)
  );

DELETE FROM public.league_feed_items
WHERE league_id = '1cf198e0-9076-4ece-a505-77312611fc26'
  AND actor_id IN (
    'cf9fc542-c918-44ed-ab4c-734203737514',
    'f237ba60-de3e-41f5-9272-81951c70c4db'
  )
  AND event_type = 'score_submitted';