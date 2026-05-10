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
      <div className="min-h-screen bg-white flex items-center justify-center text-stone-700">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  if (!comp) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center text-stone-700">
        <p>Competition not found.</p>
      </div>
    );
  }

  const unitLabel = comp.unit === "yd" ? "yd" : "m";
  const { longest, straightest } = buildLeaderboards(players, attempts);
  const isCompleted = comp.status === "completed";

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 p-6 sm:p-10">
      <header className="text-center mb-10">
        <h1 className="text-4xl sm:text-6xl font-serif italic text-stone-900">{comp.name}</h1>
        <p className="mt-2 text-sm sm:text-base text-stone-500 uppercase tracking-[0.3em]">
          {isCompleted ? "Final Results" : "Live Leaderboard"}
        </p>
      </header>

      {comp.entry_type === "paid" && !isCompleted && (
        <div className="flex flex-col items-center mb-8">
          <p className="text-xs uppercase tracking-[0.3em] text-stone-500 mb-2">Join the competition</p>
          <a
            href={`/qc/${comp.id}/join`}
            className="px-6 py-3 rounded-full bg-amber-500 text-white font-bold text-lg hover:bg-amber-600 transition-colors shadow-md"
          >
            Pay ₹{Number(comp.entry_fee ?? 0).toFixed(0)} & Enter
          </a>
          <p className="mt-2 text-xs text-stone-500">Scan or visit /qc/{comp.id.slice(0, 8)}/join</p>
        </div>
      )}

      {comp.sponsor_enabled && comp.sponsor_logo_url && (
        <div className="flex flex-col items-center mb-10">
          <p className="text-xs uppercase tracking-[0.3em] text-stone-500 mb-3">Brought to you by</p>
          <img src={comp.sponsor_logo_url} alt="Sponsor" className="h-20 sm:h-24 object-contain" />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2 max-w-7xl mx-auto">
        <Board
          icon={<Trophy className="h-7 w-7 text-amber-600" />}
          title="Longest Drive"
          accent="amber"
          rows={longest}
          unit={unitLabel}
          highlight={comp.longest_winner_player_id}
          completed={isCompleted}
        />
        <Board
          icon={<Target className="h-7 w-7 text-sky-600" />}
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
  const accentText = accent === "amber" ? "text-amber-600" : "text-sky-600";
  const accentBg = accent === "amber" ? "bg-amber-50 border-amber-300" : "bg-sky-50 border-sky-300";
  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 sm:p-8">
      <div className="flex items-center gap-3 mb-6">
        {icon}
        <h2 className={`text-2xl sm:text-3xl font-bold ${accentText}`}>{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="text-stone-400 text-center py-12">Awaiting first shot…</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => {
            const isLeader = i === 0;
            const isWinner = completed && highlight === r.player_id;
            return (
              <li
                key={r.player_id}
                className={`flex items-center justify-between rounded-lg px-4 py-3 border transition-all ${
                  isWinner || isLeader ? accentBg : "bg-stone-50 border-stone-200"
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className={`text-2xl sm:text-3xl font-bold tabular-nums ${isLeader ? accentText : "text-stone-400"}`}>
                    {i + 1}
                  </span>
                  <span className="text-xl sm:text-2xl font-semibold text-stone-900">{r.name}</span>
                </div>
                <span className={`text-2xl sm:text-3xl font-bold tabular-nums ${isLeader ? accentText : "text-stone-700"}`}>
                  {r.value.toFixed(1)} <span className="text-base text-stone-500 font-normal">{unit}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
