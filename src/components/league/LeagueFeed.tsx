import { Loader2, Trophy, UserPlus, Target, Lock } from "lucide-react";
import { useLeagueFeed, useReactToFeedItem, useUnreactFeedItem } from "@/hooks/useLeagues";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import type { LeagueFeedItem } from "@/types/league";

const EMOJI_OPTIONS = ["👏", "🔥", "⛳", "💪", "😮"];

const EVENT_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  score_submitted: { icon: <Target className="h-3.5 w-3.5" />, label: "Score Submitted", color: "text-blue-500" },
  player_joined: { icon: <UserPlus className="h-3.5 w-3.5" />, label: "Joined League", color: "text-green-500" },
  round_closed: { icon: <Lock className="h-3.5 w-3.5" />, label: "Round Closed", color: "text-amber-500" },
  leaderboard_change: { icon: <Trophy className="h-3.5 w-3.5" />, label: "Leaderboard Update", color: "text-primary" },
};

function FeedItemCard({ item, leagueId }: { item: LeagueFeedItem; leagueId: string }) {
  const react = useReactToFeedItem(leagueId);
  const unreact = useUnreactFeedItem(leagueId);
  const config = EVENT_CONFIG[item.event_type] || { icon: <Trophy className="h-3.5 w-3.5" />, label: item.event_type, color: "text-muted-foreground" };

  const getMessage = () => {
    switch (item.event_type) {
      case "score_submitted":
        return `submitted a score of ${item.payload.total_score ?? "—"} for Round ${item.payload.round_number ?? "?"}`;
      case "player_joined":
        return item.payload.team_id ? "joined a team" : "joined the league";
      case "round_closed":
        return `closed Round ${item.payload.round_number ?? "?"} — ${item.payload.scores_processed ?? 0} scores processed`;
      default:
        return item.event_type.replace(/_/g, " ");
    }
  };

  const handleReaction = (emoji: string) => {
    const existing = item.reactions.find((r) => r.emoji === emoji && r.user_reacted);
    if (existing) {
      unreact.mutate({ feedItemId: item.id, emoji });
    } else {
      react.mutate({ feedItemId: item.id, emoji });
    }
  };

  return (
    <div className="flex gap-3 py-3 border-b last:border-b-0">
      <div className={`mt-0.5 ${config.color}`}>{config.icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <span className="font-medium">{item.actor_name}</span>{" "}
          <span className="text-muted-foreground">{getMessage()}</span>
        </p>
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
        </span>
        {/* Reactions */}
        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
          {item.reactions
            .filter((r) => r.count > 0)
            .map((r) => (
              <Button
                key={r.emoji}
                size="sm"
                variant={r.user_reacted ? "default" : "outline"}
                className="h-6 px-1.5 text-xs gap-1"
                onClick={() => handleReaction(r.emoji)}
              >
                {r.emoji} {r.count}
              </Button>
            ))}
          {/* Quick add */}
          {EMOJI_OPTIONS.filter((e) => !item.reactions.some((r) => r.emoji === e && r.count > 0)).slice(0, 3).map((e) => (
            <Button
              key={e}
              size="sm"
              variant="ghost"
              className="h-6 px-1 text-xs opacity-40 hover:opacity-100"
              onClick={() => handleReaction(e)}
            >
              {e}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LeagueFeed({ leagueId }: { leagueId: string }) {
  const { data: items, isLoading } = useLeagueFeed(leagueId);

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin mx-auto my-4" />;
  if (!items || items.length === 0)
    return <p className="text-sm text-muted-foreground text-center py-6">No activity yet.</p>;

  return (
    <div className="divide-y-0">
      {items.map((item) => (
        <FeedItemCard key={item.id} item={item} leagueId={leagueId} />
      ))}
    </div>
  );
}
