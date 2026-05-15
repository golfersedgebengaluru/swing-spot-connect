import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Loader2, User, Users } from "lucide-react";
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

function LeaderboardRow({ entry, handicapActive }: { entry: LeaderboardEntry; handicapActive: boolean }) {
  return (
    <div
      className={cn(
        "grid grid-cols-[64px_1fr_120px_120px_100px] items-center gap-4 px-6 py-4 rounded-xl",
        entry.rank <= 3 ? "bg-accent/15" : "bg-card/40",
      )}
    >
      <div className={cn("text-3xl md:text-4xl font-bold tabular-nums", entry.rank === 1 ? "text-accent" : "text-foreground")}>
        {entry.rank}
      </div>
      <div className="min-w-0">
        <div className="text-xl md:text-2xl font-semibold truncate">{entry.name}</div>
        {entry.team_name && <div className="text-xs md:text-sm text-muted-foreground truncate">{entry.team_name}</div>}
      </div>
      {handicapActive ? (
        <div className="text-2xl md:text-3xl font-bold tabular-nums text-right">{formatVsPar(entry.final_vs_par)}</div>
      ) : (
        <div className="text-2xl md:text-3xl font-bold tabular-nums text-right">{Math.round(entry.total_gross)}</div>
      )}
      <div className="text-lg md:text-xl tabular-nums text-right text-muted-foreground">
        {handicapActive ? Math.round(entry.final_score) : "—"}
      </div>
      <div className="text-sm md:text-base text-right text-muted-foreground">
        {entry.rounds_played} rd{entry.rounds_played === 1 ? "" : "s"}
      </div>
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
      <header className="flex items-center justify-between gap-6 px-6 md:px-12 py-6 border-b border-border/40">
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
            <h1 className="text-2xl md:text-4xl font-bold truncate">{meta?.league?.name || (metaLoading ? "Loading…" : "League")}</h1>
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
      <div className="flex flex-wrap gap-2 md:gap-3 px-6 md:px-12 py-5">
        <CityPill active={!cityId} label="All Locations" onClick={() => setCity(null)} />
        {(meta?.cities || []).map((c) => (
          <CityPill key={c.id} active={cityId === c.id} label={c.name} onClick={() => setCity(c.id)} />
        ))}
      </div>

      {/* Leaderboard */}
      <main className="px-6 md:px-12 pb-12">
        <div className="grid grid-cols-[64px_1fr_120px_120px_100px] gap-4 px-6 pb-3 text-xs uppercase tracking-widest text-muted-foreground">
          <div>Rank</div>
          <div>Player / Team</div>
          <div className="text-right">{handicapActive ? "vs Par" : "Gross"}</div>
          <div className="text-right">{handicapActive ? "Net" : ""}</div>
          <div className="text-right">Played</div>
        </div>
        <div className="space-y-2">
          {lbLoading && entries.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading scores…
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">No scores recorded yet for this view.</div>
          ) : (
            entries.map((e) => <LeaderboardRow key={`${e.type}-${e.id}`} entry={e} handicapActive={handicapActive} />)
          )}
        </div>
      </main>
    </div>
  );
}
