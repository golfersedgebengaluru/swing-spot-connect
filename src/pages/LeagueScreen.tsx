import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Loader2, CheckCircle2, Circle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LeaderboardEntry, LeaderboardResponse, LeagueCity } from "@/types/league";

const FUNCTION_NAME = "league-service";

interface ScreenRound {
  round_number: number;
  name: string;
  start_date: string;
  end_date: string;
  closed_at: string | null;
}

interface ScreenMeta {
  league: { id: string; name: string; status: string };
  branding: {
    logo_url: string | null;
    sponsor_name: string | null;
    sponsor_logo_url: string | null;
    sponsor_url: string | null;
  };
  cities: LeagueCity[];
  rounds: ScreenRound[];
}

async function publicFetch<T>(path: string): Promise<T> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const res = await fetch(`${supabaseUrl}/functions/v1/${FUNCTION_NAME}${path}`, {
    headers: { apikey, Authorization: `Bearer ${apikey}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json as T;
}

export function useLeagueScreenMeta(leagueId: string | null) {
  return useQuery<ScreenMeta>({
    queryKey: ["league-screen-meta", leagueId],
    queryFn: () => publicFetch<ScreenMeta>(`/leagues/${leagueId}/screen`),
    enabled: !!leagueId,
    staleTime: 60_000,
  });
}

export function useLeagueScreenLeaderboard(leagueId: string | null, leagueCityId: string | null) {
  return useQuery<LeaderboardResponse>({
    queryKey: ["league-screen-leaderboard", leagueId, leagueCityId],
    queryFn: () => {
      const qs = leagueCityId ? `?league_city_id=${leagueCityId}` : "";
      return publicFetch<LeaderboardResponse>(`/leagues/${leagueId}/screen-leaderboard${qs}`);
    },
    enabled: !!leagueId,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

function formatVsPar(v: number | undefined | null) {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  if (v === 0) return "E";
  return v > 0 ? `+${v}` : `${v}`;
}

function vsParClass(v: number | undefined | null) {
  if (v === undefined || v === null) return "text-muted-foreground";
  if (v < 0) return "text-red-500";
  if (v > 0) return "text-muted-foreground";
  return "text-foreground";
}

type RoundStatus = "published" | "open" | "upcoming";

function getRoundStatus(r: ScreenRound, now: Date): RoundStatus {
  if (r.closed_at) return "published";
  const start = new Date(r.start_date);
  if (now < start) return "upcoming";
  return "open";
}

function dayName(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long" });
}

function CityPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      data-testid={`city-pill-${label}`}
      className={cn(
        "px-4 py-1.5 rounded-full text-xs md:text-sm font-medium border transition",
        active
          ? "bg-primary text-primary-foreground border-primary shadow"
          : "bg-background/40 text-foreground border-border hover:bg-background/70",
      )}
    >
      {label}
    </button>
  );
}

function RoundStatusPill({ round, status }: { round: ScreenRound; status: RoundStatus }) {
  if (status === "published") {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-3 py-1 text-xs font-medium">
        <CheckCircle2 className="h-3.5 w-3.5" />
        R{round.round_number} · Published
      </div>
    );
  }
  if (status === "open") {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 px-3 py-1 text-xs font-medium">
        <Clock className="h-3.5 w-3.5" />
        R{round.round_number} · Open · Closes {dayName(round.end_date)}
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-muted/40 text-muted-foreground border border-border px-3 py-1 text-xs font-medium">
      <Circle className="h-3.5 w-3.5" />
      R{round.round_number} · Upcoming
    </div>
  );
}

interface RowData {
  entry: LeaderboardEntry;
  rank: number | null; // null when no published rounds
  finalVsPar: number | null;
  byRound: Record<number, number | undefined>; // net_vs_par per published round
}

function computeRows(
  entries: LeaderboardEntry[],
  rounds: ScreenRound[],
  now: Date,
): RowData[] {
  const roundStatus: Record<number, RoundStatus> = {};
  for (const r of rounds) roundStatus[r.round_number] = getRoundStatus(r, now);

  const rows = entries.map<RowData>((entry) => {
    const byRound: Record<number, number | undefined> = {};
    let finalVsPar = 0;
    let anyPublished = false;
    for (const b of entry.breakdown || []) {
      if (roundStatus[b.round] !== "published") continue;
      if (typeof b.net_vs_par === "number") {
        byRound[b.round] = b.net_vs_par;
        finalVsPar += b.net_vs_par;
        anyPublished = true;
      }
    }
    return {
      entry,
      rank: null,
      finalVsPar: anyPublished ? finalVsPar : null,
      byRound,
    };
  });

  // Sort: rows with finalVsPar first (asc), then alphabetical for ties;
  // rows without any published rounds go to the bottom, alphabetical.
  rows.sort((a, b) => {
    const aHas = a.finalVsPar !== null;
    const bHas = b.finalVsPar !== null;
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    if (aHas && bHas && a.finalVsPar !== b.finalVsPar) {
      return (a.finalVsPar as number) - (b.finalVsPar as number);
    }
    return a.entry.name.localeCompare(b.entry.name);
  });

  // Assign competition-style tied ranks (1,1,1,4,...) only to rows with published scores.
  let lastScore: number | null = Number.NaN as unknown as number;
  let lastRank = 0;
  rows.forEach((r, i) => {
    if (r.finalVsPar === null) {
      r.rank = null;
      return;
    }
    if (r.finalVsPar !== lastScore) {
      lastRank = i + 1;
      lastScore = r.finalVsPar;
    }
    r.rank = lastRank;
  });

  return rows;
}

export default function LeagueScreen() {
  const { id } = useParams<{ id: string }>();
  const [search, setSearch] = useSearchParams();
  const [cityId, setCityId] = useState<string | null>(search.get("city"));

  useEffect(() => {
    setCityId(search.get("city"));
  }, [search]);

  const { data: meta, isLoading: metaLoading, error: metaError } = useLeagueScreenMeta(id || null);
  const { data: lb, isLoading: lbLoading } = useLeagueScreenLeaderboard(id || null, cityId);

  useEffect(() => {
    document.title = meta?.league?.name ? `${meta.league.name} — Live Leaderboard` : "Live Leaderboard";
  }, [meta?.league?.name]);

  const setCity = (next: string | null) => {
    setCityId(next);
    const params = new URLSearchParams(search);
    if (next) params.set("city", next);
    else params.delete("city");
    setSearch(params, { replace: true });
  };

  const entries = useMemo(() => lb?.entries || [], [lb]);
  const rounds = useMemo(() => meta?.rounds || [], [meta]);
  const now = useMemo(() => new Date(), [lb, meta]);
  const roundStatus = useMemo(() => {
    const map: Record<number, RoundStatus> = {};
    for (const r of rounds) map[r.round_number] = getRoundStatus(r, now);
    return map;
  }, [rounds, now]);

  // Keep the Teams/All toggle behavior.
  const teamEntries = useMemo(() => entries.filter((e) => e.type === "team"), [entries]);
  const hasTeams = teamEntries.length > 0;
  const viewKey = id ? `league-screen:${id}:view` : null;
  const [viewMode, setViewMode] = useState<"teams" | "all">("teams");
  useEffect(() => {
    if (!viewKey) return;
    const stored = localStorage.getItem(viewKey);
    if (stored === "teams" || stored === "all") setViewMode(stored);
  }, [viewKey]);
  const updateViewMode = (next: "teams" | "all") => {
    setViewMode(next);
    if (viewKey) localStorage.setItem(viewKey, next);
  };
  const effectiveView: "teams" | "all" = hasTeams ? viewMode : "all";
  const sourceEntries = effectiveView === "teams" ? teamEntries : entries;

  const rows = useMemo(() => computeRows(sourceEntries, rounds, now), [sourceEntries, rounds, now]);

  if (metaError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-center p-6">
        <div>
          <h1 className="text-2xl font-semibold">Leaderboard unavailable</h1>
          <p className="text-muted-foreground mt-2">{(metaError as Error).message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 sm:gap-6 px-3 sm:px-6 md:px-12 py-4 sm:py-6 border-b border-slate-800">
        <div className="flex items-center gap-4 min-w-0">
          {meta?.branding?.logo_url ? (
            <img src={meta.branding.logo_url} alt="League logo" className="h-12 md:h-16 w-auto object-contain" />
          ) : (
            <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
              <Trophy className="h-6 w-6 text-primary" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs uppercase tracking-[0.25em] text-slate-400">Live Leaderboard</p>
            <h1 className="text-lg sm:text-2xl md:text-4xl font-bold truncate tracking-tight">
              {meta?.league?.name || (metaLoading ? "Loading…" : "League")}
            </h1>
          </div>
        </div>
        {meta?.branding?.sponsor_logo_url && (
          <a
            href={meta.branding.sponsor_url || undefined}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 shrink-0"
          >
            {meta.branding.sponsor_name && (
              <span className="hidden md:block text-[10px] uppercase tracking-[0.25em] text-slate-400">Presented by</span>
            )}
            <img
              src={meta.branding.sponsor_logo_url}
              alt={meta.branding.sponsor_name || "Sponsor"}
              className="h-10 md:h-14 w-auto object-contain"
            />
          </a>
        )}
      </header>

      {/* City pills */}
      <div className="flex flex-wrap gap-2 md:gap-3 px-3 sm:px-6 md:px-12 pt-4">
        <CityPill active={!cityId} label="All Locations" onClick={() => setCity(null)} />
        {(meta?.cities || []).map((c) => (
          <CityPill key={c.id} active={cityId === c.id} label={c.name} onClick={() => setCity(c.id)} />
        ))}
      </div>

      {/* Round status strip */}
      {rounds.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 sm:px-6 md:px-12 pt-4">
          {rounds.map((r) => (
            <RoundStatusPill key={r.round_number} round={r} status={roundStatus[r.round_number]} />
          ))}
        </div>
      )}

      {/* Teams/All toggle */}
      {hasTeams && (
        <div className="flex justify-end px-3 sm:px-6 md:px-12 pt-4">
          <div className="inline-flex rounded-full border border-slate-700 bg-slate-900 p-0.5 text-xs">
            <button
              onClick={() => updateViewMode("teams")}
              className={cn(
                "px-3 py-1 rounded-full transition",
                effectiveView === "teams" ? "bg-primary text-primary-foreground" : "text-slate-400 hover:text-slate-100",
              )}
              data-testid="view-teams"
            >
              Teams
            </button>
            <button
              onClick={() => updateViewMode("all")}
              className={cn(
                "px-3 py-1 rounded-full transition",
                effectiveView === "all" ? "bg-primary text-primary-foreground" : "text-slate-400 hover:text-slate-100",
              )}
              data-testid="view-all"
            >
              All
            </button>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <main className="px-3 sm:px-6 md:px-12 pb-12 pt-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 shadow-2xl overflow-hidden">
          {lbLoading && rows.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading scores…
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm">No teams registered yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse">
                <thead>
                  <tr className="bg-slate-900/80 text-[10px] sm:text-xs uppercase tracking-wider text-slate-400">
                    <th className="sticky left-0 z-10 bg-slate-900/95 backdrop-blur px-3 sm:px-5 py-3 text-left font-semibold w-[52px]">
                      #
                    </th>
                    <th className="sticky left-[52px] z-10 bg-slate-900/95 backdrop-blur px-2 py-3 text-left font-semibold min-w-[160px]">
                      Team
                    </th>
                    {rounds.map((r) => (
                      <th key={r.round_number} className="px-3 sm:px-4 py-3 text-right font-semibold whitespace-nowrap">
                        R{r.round_number}
                      </th>
                    ))}
                    <th className="px-3 sm:px-5 py-3 text-right font-bold text-slate-200 whitespace-nowrap">Final</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ entry, rank, finalVsPar, byRound }, i) => {
                    const key = `${entry.type}-${entry.id}`;
                    const isTopThree = rank !== null && rank <= 3;
                    return (
                      <tr
                        key={key}
                        className={cn(
                          "border-t border-slate-800 transition-colors",
                          i % 2 === 0 ? "bg-slate-900/30" : "bg-slate-900/10",
                          "hover:bg-slate-800/40",
                        )}
                      >
                        <td
                          className={cn(
                            "sticky left-0 z-10 px-3 sm:px-5 py-3 sm:py-4 font-bold tabular-nums text-base sm:text-lg",
                            i % 2 === 0 ? "bg-slate-900/80" : "bg-slate-900/60",
                            isTopThree ? "text-amber-400" : "text-slate-300",
                          )}
                        >
                          {rank ?? "—"}
                        </td>
                        <td
                          className={cn(
                            "sticky left-[52px] z-10 px-2 py-3 sm:py-4",
                            i % 2 === 0 ? "bg-slate-900/80" : "bg-slate-900/60",
                          )}
                        >
                          <div className="font-semibold text-slate-100 truncate max-w-[180px] sm:max-w-[260px]">
                            {entry.name}
                          </div>
                          {entry.team_name && entry.team_name !== entry.name && (
                            <div className="text-[11px] text-slate-500 truncate max-w-[180px] sm:max-w-[260px]">
                              {entry.team_name}
                            </div>
                          )}
                        </td>
                        {rounds.map((r) => {
                          const st = roundStatus[r.round_number];
                          if (st === "upcoming") {
                            return (
                              <td key={r.round_number} className="px-3 sm:px-4 py-3 sm:py-4 text-right text-slate-600 tabular-nums">
                                —
                              </td>
                            );
                          }
                          if (st === "open") {
                            return (
                              <td
                                key={r.round_number}
                                className="px-3 sm:px-4 py-3 sm:py-4 text-right text-xs font-semibold text-amber-400/80 tabular-nums"
                              >
                                TBC
                              </td>
                            );
                          }
                          const v = byRound[r.round_number];
                          return (
                            <td
                              key={r.round_number}
                              className={cn(
                                "px-3 sm:px-4 py-3 sm:py-4 text-right tabular-nums font-medium",
                                vsParClass(v ?? null),
                              )}
                            >
                              {v === undefined ? <span className="text-slate-600">—</span> : formatVsPar(v)}
                            </td>
                          );
                        })}
                        <td
                          className={cn(
                            "px-3 sm:px-5 py-3 sm:py-4 text-right tabular-nums font-bold text-lg sm:text-xl",
                            vsParClass(finalVsPar),
                          )}
                        >
                          {finalVsPar === null ? <span className="text-slate-600">—</span> : formatVsPar(finalVsPar)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-[11px] text-slate-500 mt-3 px-1">
          Final = cumulative net-to-par across published rounds. Rounds are revealed when the admin closes them.
        </p>
      </main>
    </div>
  );
}
