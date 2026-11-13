-- Coaches can no longer add students to their own roster or re-point an
-- existing link at another member; staff assign students. Coaches keep
-- read and remove access to their own roster.
DROP POLICY IF EXISTS "Coaches manage their own students" ON public.coach_students;
DROP POLICY IF EXISTS "Coaches update their own students" ON public.coach_students;

-- Quick-competition players and attempts are no longer readable table-wide.
-- The public leaderboard reads one competition at a time through a
-- display-only function that omits internal columns such as created_by.
DROP POLICY IF EXISTS "qc players public read" ON public.quick_competition_players;
DROP POLICY IF EXISTS "qc attempts public read" ON public.quick_competition_attempts;

CREATE OR REPLACE FUNCTION public.qc_public_board(_competition_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM public.quick_competitions c WHERE c.id = _competition_id) THEN NULL
    ELSE jsonb_build_object(
      'players', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', p.id,
          'competition_id', p.competition_id,
          'name', p.name,
          'created_at', p.created_at,
          'category_id', p.category_id
        ) ORDER BY p.created_at)
        FROM public.quick_competition_players p
        WHERE p.competition_id = _competition_id
      ), '[]'::jsonb),
      'attempts', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', a.id,
          'competition_id', a.competition_id,
          'player_id', a.player_id,
          'distance', a.distance,
          'offline', a.offline,
          'created_at', a.created_at,
          'set_number', a.set_number,
          'shot_number', a.shot_number,
          'excluded', a.excluded
        ) ORDER BY a.created_at)
        FROM public.quick_competition_attempts a
        WHERE a.competition_id = _competition_id
      ), '[]'::jsonb)
    )
  END
$$;

REVOKE ALL ON FUNCTION public.qc_public_board(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.qc_public_board(uuid) TO anon, authenticated, service_role;