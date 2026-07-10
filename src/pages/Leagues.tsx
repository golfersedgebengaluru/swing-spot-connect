import { useEffect, useRef, useState } from "react";
import { useMyLegacyTeam } from "@/hooks/useMyLegacyTeam";
import { useAuth } from "@/contexts/AuthContext";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Trophy, Plus, Camera, Upload } from "lucide-react";
import { LeaguesLandingSection } from "@/components/home/LeaguesLandingSection";
import { Navigate, useLocation } from "react-router-dom";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  useLeagues,
  useTenants,
  useLeagueScores,
  useSubmitScore,
  useConfirmScore,
  useLeague,
  useLeaderboard,
  useLeagueRounds,
  useHiddenHoles,
} from "@/hooks/useLeagues";
import { supabase } from "@/integrations/supabase/client";
import type { League, LeagueScore, LeaderboardEntry } from "@/types/league";
import { useToast } from "@/hooks/use-toast";
import { RevealedRoundScores } from "@/components/league/RevealedRoundScores";


// ── Score Entry Dialog ───────────────────────────────────────
function ScoreEntryDialog({ leagueId }: { leagueId: string }) {
  const [open, setOpen] = useState(false);
  const [holeCount, setHoleCount] = useState(18);
  const [scores, setScores] = useState<number[]>(Array(18).fill(0));
  const [roundNumber, setRoundNumber] = useState<number | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrUsed, setOcrUsed] = useState(false);
  const submitScore = useSubmitScore(leagueId);
  const { data: rounds } = useLeagueRounds(leagueId);
  const { user } = useAuth();
  const { data: roundScores } = useLeagueScores(roundNumber ? leagueId : null, roundNumber ?? undefined);
  const alreadySubmitted = !!user && (roundScores || []).some((s: any) => s.submitted_by === user.id);
  const { toast } = useToast();

  // Auto-select the currently active round (today between start/end), else the
  // latest round by number. Prevents the dialog from defaulting to R1 when a
  // later round is in play.
  useEffect(() => {
    if (roundNumber != null || !rounds || rounds.length === 0) return;
    const open = rounds.filter((r) => !r.closed_at);
    if (open.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const active = open.find((r) => r.start_date <= today && r.end_date >= today);
    const sorted = [...open].sort((a, b) => b.round_number - a.round_number);
    setRoundNumber((active ?? sorted[0]).round_number);
  }, [rounds, roundNumber]);

  const updateScore = (idx: number, val: string) => {
    const updated = [...scores];
    updated[idx] = parseInt(val) || 0;
    setScores(updated);
  };

  const handleSubmit = () => {
    if (!roundNumber) {
      toast({ title: "Pick a round", description: "Select which round you're submitting for.", variant: "destructive" });
      return;
    }
    const activeScores = scores.slice(0, holeCount);
    submitScore.mutate(
      { round_number: roundNumber, hole_scores: activeScores, method: ocrUsed ? "photo_ocr" : "manual" },
      { onSuccess: () => { setOpen(false); setScores(Array(18).fill(0)); setOcrUsed(false); } }
    );
  };

  const processFile = async (file: File) => {
    setOcrLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        const { data, error } = await supabase.functions.invoke("score-ocr", {
          body: { image_base64: base64, league_id: leagueId },
        });
        if (error) throw error;
        if (data.hole_scores) {
          setScores(data.hole_scores);
          setHoleCount(data.hole_scores.length);
          setOcrUsed(true);
          toast({ title: `OCR extracted ${data.hole_scores.length} holes`, description: `Confidence: ${Math.round((data.confidence || 0) * 100)}%` });
        }
        setOcrLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("OCR error:", err);
      toast({ title: "OCR failed", description: "Please enter scores manually", variant: "destructive" });
      setOcrLoading(false);
    }
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processFile(file);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processFile(file);
  };

  const total = scores.slice(0, holeCount).reduce((s, v) => s + v, 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Submit Score</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Submit Score</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Photo / Upload OCR */}
          <div className="border-2 border-dashed rounded-lg p-4">
            {ocrLoading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Processing scorecard...</span>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
                <label className="cursor-pointer flex items-center gap-2 px-4 py-2 rounded-md border bg-background hover:bg-muted transition-colors">
                  <Camera className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Take Photo</span>
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoCapture} />
                </label>
                <label className="cursor-pointer flex items-center gap-2 px-4 py-2 rounded-md border bg-background hover:bg-muted transition-colors">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">Upload Image</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
              </div>
            )}
            <p className="text-xs text-muted-foreground text-center mt-2">Upload or photograph your scorecard for auto-fill</p>
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <Label>Round</Label>
              {rounds && rounds.length > 0 ? (
                <Select
                  value={roundNumber ? String(roundNumber) : ""}
                  onValueChange={(v) => setRoundNumber(Number(v))}
                >
                  <SelectTrigger><SelectValue placeholder="Select round" /></SelectTrigger>
                  <SelectContent>
                    {[...rounds]
                      .sort((a, b) => a.round_number - b.round_number)
                      .map((r) => (
                        <SelectItem key={r.id} value={String(r.round_number)} disabled={!!r.closed_at}>
                          R{r.round_number}: {r.name}{r.closed_at ? " (closed)" : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type="number"
                  value={roundNumber ?? ""}
                  onChange={(e) => setRoundNumber(parseInt(e.target.value) || 1)}
                  min={1}
                />
              )}
            </div>
            <div className="flex-1">
              <Label>Holes</Label>
              <div className="flex gap-2 mt-1">
                <Button size="sm" variant={holeCount === 9 ? "default" : "outline"} onClick={() => setHoleCount(9)}>9</Button>
                <Button size="sm" variant={holeCount === 18 ? "default" : "outline"} onClick={() => setHoleCount(18)}>18</Button>
              </div>
            </div>
          </div>

          {/* Hole-by-hole entry */}
          <div className="grid grid-cols-9 gap-1">
            {Array.from({ length: holeCount }, (_, i) => (
              <div key={i} className="text-center">
                <span className="text-[10px] text-muted-foreground block">{i + 1}</span>
                <Input
                  type="number"
                  value={scores[i] || ""}
                  onChange={(e) => updateScore(i, e.target.value)}
                  className="text-center text-sm p-1 h-8"
                  min={0}
                  max={15}
                />
              </div>
            ))}
          </div>

          {alreadySubmitted ? (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              Score already submitted for this round. Scores can only be submitted once — contact an admin if a correction is needed.
            </div>
          ) : (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              Please double-check your scores before hitting Submit. No changes are allowed after submission.
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Total: <span className="text-lg">{total}</span></span>
            <Button onClick={handleSubmit} disabled={submitScore.isPending || total === 0 || alreadySubmitted}>
              {submitScore.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {alreadySubmitted ? "Submitted" : "Submit"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Leaderboard (Teams only, simplified) ─────────────────────
function Leaderboard({ leagueId, league: _league }: { leagueId: string; league: League }) {
  const { data: rounds } = useLeagueRounds(leagueId);
  const [selectedRound, setSelectedRound] = useState<number | undefined>(undefined);
  const { data: leaderboard, isLoading } = useLeaderboard(leagueId, selectedRound, 'teams');
  const { data: hiddenRows } = useHiddenHoles(leagueId);

  // A round is "published" once its hidden holes have been revealed (round closed).
  const publishedRounds = new Set<number>(
    ((hiddenRows || []) as Array<{ round_number: number; hidden_holes: number[] }>)
      .filter((r) => (r.hidden_holes || []).length >= 0)
      .map((r) => r.round_number)
  );

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  const rawTeams = (leaderboard?.entries || []).filter((e) => e.type === 'team');

  // Compute each team's displayed score based on the round filter, using only published rounds.
  type Row = { id: string; name: string; scoreNum: number | null; scoreLabel: string };
  const rows: Row[] = rawTeams.map((e) => {
    let scoreNum: number | null = null;
    if (selectedRound != null) {
      if (publishedRounds.has(selectedRound)) {
        const b = e.breakdown.find((x) => x.round === selectedRound);
        if (b && b.net_vs_par !== undefined && b.net_vs_par !== null) scoreNum = b.net_vs_par;
      }
    } else {
      const pubBreak = e.breakdown.filter((b) => publishedRounds.has(b.round) && b.net_vs_par !== undefined && b.net_vs_par !== null);
      if (pubBreak.length > 0) scoreNum = pubBreak.reduce((acc, b) => acc + (b.net_vs_par as number), 0);
    }
    const scoreLabel = scoreNum === null ? '—' : scoreNum === 0 ? 'E' : scoreNum > 0 ? `+${scoreNum}` : `${scoreNum}`;
    return { id: e.id, name: e.team_name || e.name, scoreNum, scoreLabel };
  });

  // Sort: teams with a score first (ascending, lower is better), tied teams alphabetical.
  // Teams with no score at the bottom, alphabetical.
  const scored = rows.filter((r) => r.scoreNum !== null).sort((a, b) => {
    if (a.scoreNum! !== b.scoreNum!) return a.scoreNum! - b.scoreNum!;
    return a.name.localeCompare(b.name);
  });
  const unscored = rows.filter((r) => r.scoreNum === null).sort((a, b) => a.name.localeCompare(b.name));

  // Competition ranking (1224): tied teams share rank, next rank skips.
  const ranked: Array<Row & { rank: number | null }> = [];
  let currentRank = 0;
  let seen = 0;
  let lastScore: number | null = null;
  for (const r of scored) {
    seen += 1;
    if (r.scoreNum !== lastScore) {
      currentRank = seen;
      lastScore = r.scoreNum;
    }
    ranked.push({ ...r, rank: currentRank });
  }
  for (const r of unscored) ranked.push({ ...r, rank: null });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <Label className="text-xs">Round</Label>
          <Select value={selectedRound ? String(selectedRound) : "all"} onValueChange={(v) => setSelectedRound(v === "all" ? undefined : Number(v))}>
            <SelectTrigger className="w-[160px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Rounds</SelectItem>
              {(rounds || []).map((r) => (
                <SelectItem key={r.round_number} value={String(r.round_number)}>R{r.round_number}: {r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground italic">
        Only scores from closed rounds are published on the leaderboard.
      </p>

      {ranked.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No teams to display yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Rank</TableHead>
              <TableHead>Team</TableHead>
              <TableHead className="text-right">Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ranked.map((r) => {
              const vsCls = r.scoreNum === null
                ? 'text-muted-foreground'
                : r.scoreNum < 0 ? 'text-emerald-600'
                : r.scoreNum > 0 ? 'text-red-600'
                : 'text-muted-foreground';
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-semibold">{r.rank ?? '—'}</TableCell>
                  <TableCell className="font-medium text-sm">{r.name}</TableCell>
                  <TableCell className={cn('text-right font-semibold', vsCls)}>{r.scoreLabel}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ── League Card ──────────────────────────────────────────────
function LeagueCard({ league }: { league: League }) {
  const { hash } = useLocation();
  const targetId = `league-${league.id}`;
  const hashMatches = hash === `#${targetId}`;
  const [expanded, setExpanded] = useState(hashMatches);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (hashMatches) {
      setExpanded(true);
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [hashMatches]);

  return (
    <Card ref={ref} id={targetId}>
      <CardHeader className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {league.resolved_logo_url ? (
              <img src={league.resolved_logo_url} alt="" className="h-10 w-10 rounded object-contain" />
            ) : (
              <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center">
                <Trophy className="h-5 w-5 text-primary" />
              </div>
            )}
            <div>
              <CardTitle className="text-base">{league.name}</CardTitle>
              <p className="text-xs text-muted-foreground">{league.format.replace(/_/g, " ")} · {league.status}</p>
            </div>
          </div>
          <Badge variant={league.status === "active" ? "default" : "secondary"}>{league.status}</Badge>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4">
          <Tabs defaultValue="leaderboard">
            <TabsList>
              <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
              <TabsTrigger value="my-scores">My Scores</TabsTrigger>
            </TabsList>
            <TabsContent value="leaderboard">
              <Leaderboard leagueId={league.id} league={league} />
            </TabsContent>
            <TabsContent value="my-scores">
              <MyScores leagueId={league.id} league={league} />
            </TabsContent>
          </Tabs>
          {league.status === "active" && <ScoreEntryDialog leagueId={league.id} />}
        </CardContent>
      )}
    </Card>
  );
}

// ── My Scores ────────────────────────────────────────────────
function MyScores({ leagueId, league }: { leagueId: string; league: League }) {
  const { user } = useAuth();
  const { data: allScores, isLoading } = useLeagueScores(leagueId);
  const { data: rounds } = useLeagueRounds(leagueId);
  const { data: hiddenRows } = useHiddenHoles(leagueId);
  const { data: myTeam } = useMyLegacyTeam(leagueId);
  const confirmScore = useConfirmScore(leagueId);

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin mx-auto" />;

  const myScores = (allScores || []).filter((s) => s.player_id === user?.id);

  // Teammate identity: use the hybrid roster (league_players) when available
  // — this includes managed/shadow members whose scores are keyed by
  // league_players.id (not a user_id). Fall back to legacy members list.
  const roster = myTeam?.roster || [];
  const rosterIdentityIds: string[] = roster.length > 0
    ? Array.from(new Set(roster.flatMap((r) => [r.user_id, r.id]).filter(Boolean) as string[]))
    : ((myTeam?.members || []).map((m) => m.user_id).filter(Boolean) as string[]);

  // Teammate names for the roster panel (always visible once a team exists)
  const teammateNames: string[] = roster.length > 0
    ? roster
        .filter((r) => r.user_id !== user?.id)
        .map((r) => r.display_name || "Player")
    : (myTeam?.members || [])
        .filter((m) => m.user_id !== user?.id)
        .map((m) => m.display_name || "Player");

  // Always include self so a soloist still sees their hole-by-hole
  const playerIds = Array.from(new Set([user?.id, ...rosterIdentityIds].filter(Boolean) as string[]));

  if (myScores.length === 0 && (!rounds || rounds.length === 0) && teammateNames.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">No scores submitted yet.</p>;
  }

  const revealedByRound = new Map<number, number[]>();
  for (const r of (hiddenRows || []) as Array<{ round_number: number; hidden_holes: number[] }>) {
    revealedByRound.set(r.round_number, r.hidden_holes || []);
  }

  // Round list: every round the team has any score in, plus rounds the user has
  const roundNumbers = new Set<number>(myScores.map((s) => s.round_number));
  for (const s of allScores || []) {
    if (playerIds.includes(s.player_id)) roundNumbers.add(s.round_number);
  }
  const orderedRounds = Array.from(roundNumbers).sort((a, b) => b - a);

  return (
    <div className="space-y-6">
      {teammateNames.length > 0 && (
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="text-xs font-semibold text-muted-foreground mb-1.5">Your team</div>
          <div className="flex flex-wrap gap-1.5">
            {teammateNames.map((n, i) => (
              <Badge key={`${n}-${i}`} variant="secondary" className="text-xs">{n}</Badge>
            ))}
          </div>
        </div>
      )}
      {orderedRounds.map((rn) => {
        const round = (rounds || []).find((r) => r.round_number === rn);
        const mine = myScores.find((s) => s.round_number === rn);
        const hidden = revealedByRound.get(rn) || [];
        const closed = revealedByRound.has(rn);
        return (
          <div key={rn} className="space-y-2 border rounded-md p-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm font-semibold">
                Round {rn}{round?.name ? `: ${round.name}` : ""}
                {closed && <Badge variant="secondary" className="ml-2 text-[10px]">Closed</Badge>}
              </div>
              {mine && (
                <div className="flex items-center gap-2 text-xs">
                  <span>My total: <span className="font-semibold text-base">{mine.total_score ?? "—"}</span></span>
                  <Badge variant="secondary">{mine.method}</Badge>
                  {mine.confirmed_at ? <Badge>Confirmed</Badge> : <Badge variant="outline">Pending</Badge>}
                  {!mine.confirmed_at && (
                    <Button size="sm" variant="outline" onClick={() => confirmScore.mutate({ score_id: mine.id })} disabled={confirmScore.isPending}>
                      Confirm
                    </Button>
                  )}
                </div>
              )}
            </div>
            <RevealedRoundScores
              leagueId={leagueId}
              roundNumber={rn}
              parPerHole={(round?.par_per_hole as number[]) || []}
              hiddenHoles={hidden}
              playerIds={playerIds}
              showTeamTotal={rosterIdentityIds.length > 0}
              showPoints={league.stableford_enabled !== false}
              format={league.format}
            />
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════
export default function Leagues() {
  const { user, loading: authLoading } = useAuth();
  const { data: tenants, isLoading: tenantsLoading } = useTenants();

  // Collect leagues from all user tenants
  const firstTenantId = tenants?.[0]?.id ?? null;
  const { data: leagues, isLoading: leaguesLoading } = useLeagues(firstTenantId);

  if (authLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/auth?redirect=/leagues" replace />;

  const isLoading = tenantsLoading || leaguesLoading;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold font-display">My Leagues</h1>
          <p className="text-sm text-muted-foreground">Compete, track scores, and climb the leaderboard</p>
        </div>

        <LeaguesLandingSection />

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (!leagues || leagues.length === 0) ? null : (
          <div className="space-y-4 mt-8">
            {leagues.map(l => <LeagueCard key={l.id} league={l} />)}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
