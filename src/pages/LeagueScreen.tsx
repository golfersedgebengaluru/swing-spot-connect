import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Loader2, User, Users, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LeaderboardEntry, LeaderboardResponse, LeagueCity } from "@/types/league";

const FUNCTION_NAME = "league-service";

interface ScreenMeta {
  league: { id: string; name: string; status: string };
  branding: {
    logo_url: string | null;
    sponsor_name: string | null;
    sponsor_logo_url: string | null;
    sponsor_url: string | null;
  };
  cities: LeagueCity[];
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

function formatVsPar(v: number | undefined) {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  if (v === 0) return "E";
  return v > 0 ? `+${v}` : `${v}`;
}

function CityPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      data-testid={`city-pill-${label}`}
      className={cn(
        "px-5 py-2 rounded-full text-sm md:text-base font-medium border transition",
        active
          ? "bg-primary text-primary-foreground border-primary shadow"
          : "bg-background/40 text-foreground border-border hover:bg-background/70",
      )}
    >
      {label}
    </button>
  );
}

function TypePill({ type }: { type: "individual" | "team" }) {
  if (type === "team") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-foreground text-background px-2.5 py-0.5 text-[11px] font-medium">
        <Trophy className="h-3 w-3" /> Team
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] font-medium text-foreground">
      <User className="h-3 w-3" /> Individual
    </span>
  );
}

function LeaderboardRow({
  entry,
  rank,
  handicapActive,
  expandable,
  expanded,
  onToggle,
}: {
  entry: LeaderboardEntry;
  rank: number;
  handicapActive: boolean;
  expandable: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const net = Math.round(entry.total_net);
  const par = entry.total_par !== undefined ? Math.round(entry.total_par) : null;
  const vsPar = entry.final_vs_par;
  const final = Math.round(entry.final_score);
  const vsParClass = (vsPar ?? 0) > 0 ? "text-destructive" : (vsPar ?? 0) < 0 ? "text-emerald-600" : "text-foreground";
  const interactive = expandable;
  const baseDesktop = "hidden sm:grid grid-cols-[28px_40px_minmax(0,1.6fr)_110px_60px_60px_70px_70px_70px] items-center gap-3 px-4 py-3 border-b border-border/60 transition-colors";
  const baseMobile = "sm:hidden flex items-center gap-2 px-3 py-3 border-b border-border/60 transition-colors";
  const interactiveCls = interactive ? "cursor-pointer hover:bg-muted/40" : "";
  return (
    <>
      {/* Desktop / tablet row */}
      <div
        className={cn(baseDesktop, interactiveCls)}
        onClick={interactive ? onToggle : undefined}
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-expanded={interactive ? expanded : undefined}
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle();
                }
              }
            : undefined
        }
      >
        <div className="flex items-center justify-center text-muted-foreground">
          {expandable ? (
            <ChevronRight className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")} />
          ) : null}
        </div>
        <div className="text-base font-semibold tabular-nums">{rank}</div>
        <div className="min-w-0">
          <div className="font-medium truncate">{entry.name}</div>
          {entry.team_name && <div className="text-xs text-muted-foreground truncate">{entry.team_name}</div>}
        </div>
        <div><TypePill type={entry.type} /></div>
        <div className="text-right tabular-nums">{net}</div>
        <div className="text-right tabular-nums text-muted-foreground">{par ?? "—"}</div>
        <div className={cn("text-right tabular-nums font-semibold", vsParClass)}>
          {handicapActive ? formatVsPar(vsPar) : "—"}
        </div>
        <div className="text-right tabular-nums font-bold">{final}</div>
        <div className="text-right tabular-nums text-muted-foreground">{entry.rounds_played}</div>
      </div>

      {/* Mobile row */}
      <div
        className={cn(baseMobile, interactiveCls)}
        onClick={interactive ? onToggle : undefined}
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-expanded={interactive ? expanded : undefined}
      >
        <div className="w-4 shrink-0 text-muted-foreground">
          {expandable ? (
            <ChevronRight className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")} />
          ) : null}
        </div>
        <div className="w-6 text-base font-semibold tabular-nums shrink-0">{rank}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium truncate">{entry.name}</span>
            {entry.type === "team" ? (
              <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            ) : (
              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums">
            <span>Net {net}</span>
            <span>Par {par ?? "—"}</span>
            {handicapActive && <span className={cn("font-semibold", vsParClass)}>{formatVsPar(vsPar)}</span>}
            <span>R {entry.rounds_played}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-bold tabular-nums leading-none">{final}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">Final</div>
        </div>
      </div>
    </>
  );
}

function MemberSubRows({ members }: { members: NonNullable<LeaderboardEntry["members"]> }) {
  if (!members.length) {
    return (
      <div className="px-4 py-3 text-xs text-muted-foreground bg-muted/20 border-b border-border/60">
        No member scores recorded.
      </div>
    );
  }
  return (
    <div className="bg-muted/20 border-b border-border/60" data-testid="team-members">
      {members.map((m) => (
        <div key={m.player_id}>
          {/* Desktop sub-row */}
          <div className="hidden sm:grid grid-cols-[28px_40px_minmax(0,1.6fr)_110px_60px_60px_70px_70px_70px] items-center gap-3 pl-12 pr-4 py-2 text-sm">
            <div />
            <div className="text-xs text-muted-foreground">·</div>
            <div className="min-w-0 truncate text-muted-foreground">{m.name}</div>
            <div />
            <div className="text-right tabular-nums text-muted-foreground">{Math.round(m.net_score)}</div>
            <div />
            <div />
            <div />
            <div />
          </div>
          {/* Mobile sub-row */}
          <div className="sm:hidden flex items-center gap-2 pl-9 pr-3 py-1.5 text-xs text-muted-foreground">
            <span className="truncate flex-1">· {m.name}</span>
            <span className="tabular-nums">Net {Math.round(m.net_score)}</span>
          </div>
        </div>
      ))}
    </div>
  );
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
  const handicapActive = !!lb?.handicap_active;

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

  const displayRows = useMemo(() => {
    if (effectiveView === "teams") {
      return teamEntries.map((entry, i) => ({ entry, rank: i + 1 }));
    }
    return entries.map((entry) => ({ entry, rank: entry.rank }));
  }, [effectiveView, teamEntries, entries]);

  const [openTeams, setOpenTeams] = useState<Record<string, boolean>>({});
  const toggleTeam = (key: string) => setOpenTeams((s) => ({ ...s, [key]: !s[key] }));

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
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 text-foreground">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 sm:gap-6 px-3 sm:px-6 md:px-12 py-4 sm:py-6 border-b border-border/40">
        <div className="flex items-center gap-4 min-w-0">
          {meta?.branding?.logo_url ? (
            <img src={meta.branding.logo_url} alt="League logo" className="h-14 md:h-20 w-auto object-contain" />
          ) : (
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Trophy className="h-7 w-7 text-primary" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Live Leaderboard</p>
            <h1 className="text-lg sm:text-2xl md:text-4xl font-bold truncate">{meta?.league?.name || (metaLoading ? "Loading…" : "League")}</h1>
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
              <span className="hidden md:block text-xs uppercase tracking-widest text-muted-foreground">Presented by</span>
            )}
            <img src={meta.branding.sponsor_logo_url} alt={meta.branding.sponsor_name || "Sponsor"} className="h-12 md:h-16 w-auto object-contain" />
          </a>
        )}
      </header>

      {/* City pills */}
      <div className="flex flex-wrap gap-2 md:gap-3 px-3 sm:px-6 md:px-12 py-3 sm:py-5">
        <CityPill active={!cityId} label="All Locations" onClick={() => setCity(null)} />
        {(meta?.cities || []).map((c) => (
          <CityPill key={c.id} active={cityId === c.id} label={c.name} onClick={() => setCity(c.id)} />
        ))}
      </div>

      {/* Leaderboard */}
      <main className="px-3 sm:px-6 md:px-12 pb-12">
        {hasTeams && (
          <div className="flex items-center justify-end mb-2">
            <div className="inline-flex rounded-full border border-border bg-background/60 p-0.5 text-xs">
              <button
                onClick={() => updateViewMode("teams")}
                className={cn(
                  "px-3 py-1 rounded-full transition",
                  effectiveView === "teams" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                data-testid="view-teams"
              >
                Teams
              </button>
              <button
                onClick={() => updateViewMode("all")}
                className={cn(
                  "px-3 py-1 rounded-full transition",
                  effectiveView === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                data-testid="view-all"
              >
                All
              </button>
            </div>
          </div>
        )}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          {/* Header row (desktop) */}
          <div className="hidden sm:grid grid-cols-[28px_40px_minmax(0,1.6fr)_110px_60px_60px_70px_70px_70px] gap-3 px-4 py-3 border-b border-border bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            <div />
            <div>#</div>
            <div>Name</div>
            <div>Type</div>
            <div className="text-right">Net</div>
            <div className="text-right">Par</div>
            <div className="text-right">vs Par</div>
            <div className="text-right">Final</div>
            <div className="text-right">Rounds</div>
          </div>
          {/* Header row (mobile) */}
          <div className="sm:hidden flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            <div className="w-4" />
            <div className="w-6">#</div>
            <div className="flex-1">Name</div>
            <div className="w-12 text-right">Final</div>
          </div>
          {lbLoading && displayRows.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading scores…
            </div>
          ) : displayRows.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">No scores recorded yet for this view.</div>
          ) : (
            displayRows.map(({ entry, rank }) => {
              const key = `${entry.type}-${entry.id}`;
              const expandable = entry.type === "team" && !!entry.members;
              const expanded = !!openTeams[key];
              return (
                <div key={key}>
                  <LeaderboardRow
                    entry={entry}
                    rank={rank}
                    handicapActive={handicapActive}
                    expandable={expandable}
                    expanded={expanded}
                    onToggle={() => toggleTeam(key)}
                  />
                  {expandable && expanded && <MemberSubRows members={entry.members || []} />}
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
