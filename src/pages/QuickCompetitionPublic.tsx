import { useParams } from "react-router-dom";
import { Trophy, Target, Loader2 } from "lucide-react";
import {
  useQuickCompetition, useQCPlayers, useQCAttempts, useQCRealtime, buildLeaderboards,
} from "@/hooks/useQuickCompetitions";

export default function QuickCompetitionPublic() {
  const { id } = useParams<{ id: string }>();
  const competitionId = id ?? null;
  const { data: comp, isLoading } = useQuickCompetition(competitionId);
  const { data: players = [] } = useQCPlayers(competitionId);
  const { data: attempts = [] } = useQCAttempts(competitionId);
  useQCRealtime(competitionId);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  if (!comp) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <p>Competition not found.</p>
      </div>
    );
  }

  const unitLabel = comp.unit === "yd" ? "yd" : "m";
  const { longest, straightest } = buildLeaderboards(players, attempts);
  const isCompleted = comp.status === "completed";

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 sm:p-10">
      <header className="text-center mb-10">
        <h1 className="text-4xl sm:text-6xl font-serif italic">{comp.name}</h1>
        <p className="mt-2 text-sm sm:text-base text-slate-400 uppercase tracking-[0.3em]">
          {isCompleted ? "Final Results" : "Live Leaderboard"}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2 max-w-7xl mx-auto">
        <Board
          icon={<Trophy className="h-7 w-7 text-amber-400" />}
          title="Longest Drive"
          accent="amber"
          rows={longest}
          unit={unitLabel}
          highlight={comp.longest_winner_player_id}
          completed={isCompleted}
        />
        <Board
          icon={<Target className="h-7 w-7 text-sky-400" />}
          title="Straightest Drive"
          accent="sky"
          rows={straightest}
          unit={unitLabel}
          highlight={comp.straightest_winner_player_id}
          completed={isCompleted}
        />
      </div>

      {isCompleted && (comp.longest_card_url || comp.straightest_card_url) && (
        <div className="mt-12 grid gap-6 sm:grid-cols-2 max-w-4xl mx-auto">
          {comp.longest_card_url && <img src={comp.longest_card_url} alt="Longest winner" className="w-full rounded-xl shadow-2xl" />}
          {comp.straightest_card_url && <img src={comp.straightest_card_url} alt="Straightest winner" className="w-full rounded-xl shadow-2xl" />}
        </div>
      )}
    </div>
  );
}

function Board({
  icon, title, accent, rows, unit, highlight, completed,
}: {
  icon: React.ReactNode;
  title: string;
  accent: "amber" | "sky";
  rows: { player_id: string; name: string; value: number }[];
  unit: string;
  highlight: string | null;
  completed: boolean;
}) {
  const accentText = accent === "amber" ? "text-amber-400" : "text-sky-400";
  const accentBg = accent === "amber" ? "bg-amber-400/10 border-amber-400/40" : "bg-sky-400/10 border-sky-400/40";
  return (
    <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-6 sm:p-8">
      <div className="flex items-center gap-3 mb-6">
        {icon}
        <h2 className={`text-2xl sm:text-3xl font-bold ${accentText}`}>{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="text-slate-500 text-center py-12">Awaiting first shot…</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => {
            const isLeader = i === 0;
            const isWinner = completed && highlight === r.player_id;
            return (
              <li
                key={r.player_id}
                className={`flex items-center justify-between rounded-lg px-4 py-3 border transition-all ${
                  isWinner || isLeader ? accentBg : "bg-slate-800/40 border-slate-800"
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className={`text-2xl sm:text-3xl font-bold tabular-nums ${isLeader ? accentText : "text-slate-500"}`}>
                    {i + 1}
                  </span>
                  <span className="text-xl sm:text-2xl font-semibold">{r.name}</span>
                </div>
                <span className={`text-2xl sm:text-3xl font-bold tabular-nums ${isLeader ? accentText : "text-slate-200"}`}>
                  {r.value.toFixed(1)} <span className="text-base text-slate-400 font-normal">{unit}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
