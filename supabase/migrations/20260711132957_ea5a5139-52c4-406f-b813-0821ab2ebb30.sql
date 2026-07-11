
-- Rewrite historical league_scores.player_id when a shadow player claims their account.
-- Before: score.player_id = league_players.id (shadow rows have user_id NULL).
-- On UPDATE league_players.user_id NULL -> non-NULL, rewrite all scores in the
-- same league from league_players.id -> new user_id so the player's history
-- stays unified across all leaderboards and views.

CREATE OR REPLACE FUNCTION public.rewrite_scores_on_player_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (OLD.user_id IS NULL OR OLD.user_id IS DISTINCT FROM NEW.user_id)
     AND NEW.user_id IS NOT NULL THEN
    UPDATE public.league_scores
       SET player_id = NEW.user_id
     WHERE league_id = NEW.league_id
       AND player_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rewrite_scores_on_player_claim ON public.league_players;
CREATE TRIGGER trg_rewrite_scores_on_player_claim
AFTER UPDATE OF user_id ON public.league_players
FOR EACH ROW
EXECUTE FUNCTION public.rewrite_scores_on_player_claim();
