import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Loader2 } from "lucide-react";
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
  if (v === undefined || v === null) return "text-stone-500";
  if (v < 0) return "text-red-600";
  if (v > 0) return "text-stone-500";
  return "text-stone-800";
}

type RoundStatus = "published" | "open" | "upcoming";

function getRoundStatus(r: ScreenRound, now: Date): RoundStatus {
  if (r.closed_at) return "published";
  const start = new Date(r.start_date);
  // Open once start date reached; stays Open until admin closes (single source of truth).
  if (now < start) return "upcoming";
  return "open";
}

function dayName(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long" });
}

// Deterministic soft avatar color from team name.
function avatarColor(name: string) {
  const palette = [
    "bg-rose-200 text-rose-800",
    "bg-amber-200 text-amber-800",
    "bg-emerald-200 text-emerald-800",
    "bg-sky-200 text-sky-800",
    "bg-violet-200 text-violet-800",
    "bg-orange-200 text-orange-800",
    "bg-teal-200 text-teal-800",
    "bg-fuchsia-200 text-fuchsia-800",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function rankBadgeClass(rank: number | null) {
  if (rank === 1) return "bg-amber-400 text-amber-950 ring-amber-500/40";
  if (rank === 2) return "bg-slate-300 text-slate-800 ring-slate-400/40";
  if (rank === 3) return "bg-orange-300 text-orange-900 ring-orange-400/40";
  return "bg-stone-100 text-stone-600 ring-stone-200";
}

function CityPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      data-testid={`city-pill-${label}`}
      className={cn(
        "px-4 py-1.5 rounded-full text-xs md:text-sm font-medium border transition",
        active
          ? "bg-stone-900 text-stone-50 border-stone-900 shadow-sm"
          : "bg-white/60 text-stone-700 border-stone-200 hover:bg-white",
      )}
    >
      {label}
    </button>
  );
}

function RoundStatusPill({ round, status }: { round: ScreenRound; status: RoundStatus }) {
  const base = "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium border";
  if (status === "published") {
    return (
      <div className={cn(base, "bg-emerald-50 text-emerald-800 border-emerald-200")}>
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        ✓ R{round.round_number} · Published
      </div>
    );
  }
  if (status === "open") {
    return (
      <div className={cn(base, "bg-amber-50 text-amber-800 border-amber-300")}>
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
        ● R{round.round_number} · Open · Closes {dayName(round.end_date)}
      </div>
    );
  }
  return (
    <div className={cn(base, "bg-stone-50 text-stone-500 border-stone-300 border-dashed")}>
      <span className="h-1.5 w-1.5 rounded-full bg-stone-400" />
      ● R{round.round_number} · Upcoming
    </div>
  );
}

interface RowData {
  entry: LeaderboardEntry;
  rank: number | null;
  finalVsPar: number | null;
  byRound: Record<number, number | undefined>;
  qualified: boolean;
}

function computeRows(entries: LeaderboardEntry[], rounds: ScreenRound[], now: Date): RowData[] {
  const roundStatus: Record<number, RoundStatus> = {};
  for (const r of rounds) roundStatus[r.round_number] = getRoundStatus(r, now);
  const publishedRoundNums = rounds
    .filter((r) => roundStatus[r.round_number] === "published")
    .map((r) => r.round_number);
  const totalPublished = publishedRoundNums.length;

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
    const playedPublished = publishedRoundNums.filter((rn) => byRound[rn] !== undefined).length;
    const qualified = totalPublished === 0 ? true : playedPublished >= totalPublished;
    return { entry, rank: null, finalVsPar: anyPublished ? finalVsPar : null, byRound, qualified };
  });

  rows.sort((a, b) => {
    // Qualified entries always rank above non-qualified.
    if (a.qualified !== b.qualified) return a.qualified ? -1 : 1;
    const aHas = a.finalVsPar !== null;
    const bHas = b.finalVsPar !== null;
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    if (aHas && bHas && a.finalVsPar !== b.finalVsPar) {
      return (a.finalVsPar as number) - (b.finalVsPar as number);
    }
    return a.entry.name.localeCompare(b.entry.name);
  });

  // Continuous ranks 1..N across both groups; unscored (no rounds published for them) get null.
  let lastScore: number | null = Number.NaN as unknown as number;
  let lastQualified: boolean | null = null;
  let lastRank = 0;
  rows.forEach((r, i) => {
    if (r.finalVsPar === null) {
      r.rank = null;
      return;
    }
    if (r.finalVsPar !== lastScore || r.qualified !== lastQualified) {
      lastRank = i + 1;
      lastScore = r.finalVsPar;
      lastQualified = r.qualified;
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

  // Teams-only competition: never show individual players.
  const teamEntries = useMemo(() => entries.filter((e) => e.type === "team"), [entries]);
  const rows = useMemo(() => computeRows(teamEntries, rounds, now), [teamEntries, rounds, now]);

  if (metaError) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center text-center p-6">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Leaderboard unavailable</h1>
          <p className="text-stone-500 mt-2">{(metaError as Error).message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F1E7] text-stone-900">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 sm:gap-6 px-3 sm:px-6 md:px-12 py-4 sm:py-6 border-b border-stone-200/70">
        <div className="flex items-center gap-4 min-w-0">
          {meta?.branding?.logo_url ? (
            <img src={meta.branding.logo_url} alt="League logo" className="h-12 md:h-16 w-auto object-contain" />
          ) : (
            <div className="h-12 w-12 rounded-full bg-stone-200 flex items-center justify-center">
              <Trophy className="h-6 w-6 text-stone-700" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[10px] sm:text-xs uppercase tracking-[0.25em] text-stone-500">Live Leaderboard</p>
            <h1 className="text-lg sm:text-2xl md:text-4xl font-bold truncate tracking-tight text-stone-900">
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
              <span className="hidden md:block text-[10px] uppercase tracking-[0.25em] text-stone-500">Presented by</span>
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

      {/* Leaderboard */}
      <main className="px-3 sm:px-6 md:px-12 pb-12 pt-4">
        <p className="text-[11px] sm:text-xs italic text-stone-500 mb-2 px-1">
          Scores for all rounds must be submitted to qualify to win. Teams with missing rounds are ranked below all fully-qualified teams.
        </p>
        <div className="rounded-2xl border border-stone-200 bg-white shadow-sm overflow-hidden">
          {lbLoading && rows.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-stone-500">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading scores…
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-stone-500 text-sm">No teams registered yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse">
                <thead>
                  <tr className="bg-stone-50 text-[10px] sm:text-xs uppercase tracking-wider text-stone-500 border-b border-stone-200">
                    <th className="sticky left-0 z-10 bg-stone-50 px-3 sm:px-5 py-3 text-left font-semibold w-[60px]">#</th>
                    <th className="sticky left-[60px] z-10 bg-stone-50 px-2 py-3 text-left font-semibold min-w-[180px]">
                      Team
                    </th>
                    {rounds.map((r) => {
                      const st = roundStatus[r.round_number];
                      return (
                        <th
                          key={r.round_number}
                          className={cn(
                            "px-3 sm:px-4 py-3 text-right font-semibold whitespace-nowrap",
                            st === "open" && "text-emerald-700",
                          )}
                        >
                          R{r.round_number}
                        </th>
                      );
                    })}
                    <th className="px-3 sm:px-5 py-3 text-right font-bold text-stone-700 whitespace-nowrap border-l border-stone-200">
                      Final
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ entry, rank, finalVsPar, byRound, qualified }, i) => {
                    const key = `${entry.type}-${entry.id}`;
                    const rowBg = i % 2 === 0 ? "bg-white" : "bg-stone-50/60";
                    return (
                      <tr key={key} className={cn("border-t border-stone-100 transition-colors hover:bg-amber-50/40", rowBg, !qualified && "opacity-70")}>
                        <td className={cn("sticky left-0 z-10 px-3 sm:px-5 py-3 sm:py-4", rowBg)}>
                          <span
                            className={cn(
                              "inline-flex items-center justify-center h-8 w-8 rounded-full text-sm font-bold tabular-nums ring-1",
                              rankBadgeClass(rank),
                            )}
                          >
                            {rank ?? "—"}
                          </span>
                        </td>
                        <td className={cn("sticky left-[60px] z-10 px-2 py-3 sm:py-4", rowBg)}>
                          <div className="flex items-center gap-3">
                            <span
                              className={cn(
                                "inline-flex items-center justify-center h-9 w-9 rounded-full text-xs font-bold shrink-0",
                                avatarColor(entry.name),
                              )}
                            >
                              {initials(entry.name)}
                            </span>
                            <div className="min-w-0">
                              <div className="font-semibold text-stone-900 truncate max-w-[180px] sm:max-w-[280px] flex items-center gap-2">
                                <span className="truncate">{entry.name}</span>
                                {!qualified && (
                                  <span className="shrink-0 inline-flex items-center rounded-full border border-stone-300 bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-600">
                                    Incomplete
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        {rounds.map((r) => {
                          const st = roundStatus[r.round_number];
                          const cellBase = "px-3 sm:px-4 py-3 sm:py-4 text-right tabular-nums";
                          if (st === "upcoming") {
                            return (
                              <td key={r.round_number} className={cn(cellBase, "text-stone-300")}>
                                —
                              </td>
                            );
                          }
                          if (st === "open") {
                            return (
                              <td
                                key={r.round_number}
                                className={cn(cellBase, "text-xs font-semibold text-stone-400 bg-emerald-50/30")}
                              >
                                TBC
                              </td>
                            );
                          }
                          const v = byRound[r.round_number];
                          return (
                            <td key={r.round_number} className={cn(cellBase, "font-medium", vsParClass(v ?? null))}>
                              {v === undefined ? <span className="text-stone-300">—</span> : formatVsPar(v)}
                            </td>
                          );
                        })}
                        <td
                          className={cn(
                            "px-3 sm:px-5 py-3 sm:py-4 text-right tabular-nums font-bold text-lg sm:text-2xl border-l border-stone-100",
                            vsParClass(finalVsPar),
                          )}
                        >
                          {finalVsPar === null ? <span className="text-stone-300">—</span> : formatVsPar(finalVsPar)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 px-1 text-[11px] text-stone-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500" /> Under par
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-stone-400" /> Over / even par
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-stone-200" /> Round not published
          </span>
          <span className="ml-auto">
            Final = cumulative net-to-par across published rounds. Rounds are revealed when the admin closes them.
          </span>
        </div>
      </main>
    </div>
  );
}
