import { useEffect, useRef, useState } from "react";
import { LeagueFeed } from "@/components/league/LeagueFeed";
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
import { Loader2, Trophy, Plus, Camera, Upload, ChevronRight } from "lucide-react";
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
} from "@/hooks/useLeagues";
import { supabase } from "@/integrations/supabase/client";
import type { League, LeagueScore, LeaderboardEntry } from "@/types/league";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();

  // Auto-select the currently active round (today between start/end), else the
  // latest round by number. Prevents the dialog from defaulting to R1 when a
  // later round is in play.
  useEffect(() => {
    if (roundNumber != null || !rounds || rounds.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const active = rounds.find((r) => r.start_date <= today && r.end_date >= today);
    const sorted = [...rounds].sort((a, b) => b.round_number - a.round_number);
    setRoundNumber((active ?? sorted[0]).round_number);
  }, [rounds, roundNumber]);

  const updateScore = (idx: number, val: string) => {
    const updated = [...scores];
    updated[idx] = parseInt(val) || 0;
    setScores(updated);
  };

  const handleSubmit = () => {
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
              <Input type="number" value={roundNumber} onChange={(e) => setRoundNumber(parseInt(e.target.value) || 1)} min={1} />
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

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Total: <span className="text-lg">{total}</span></span>
            <Button onClick={handleSubmit} disabled={submitScore.isPending || total === 0}>
              {submitScore.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Submit
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Leaderboard (mirrors Admin LeaderboardPanel) ─────────────
function Leaderboard({ leagueId, league }: { leagueId: string; league: League }) {
  const { data: rounds } = useLeagueRounds(leagueId);
  const [selectedRound, setSelectedRound] = useState<number | undefined>(undefined);
  const [filter, setFilter] = useState<'all' | 'individuals' | 'teams'>('all');
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const { data: leaderboard, isLoading } = useLeaderboard(leagueId, selectedRound, filter);

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  const rawEntries = leaderboard?.entries || [];
  const teamEntries = rawEntries.filter((e) => e.type === 'team');
  const hasTeams = teamEntries.length > 0;
  const teamFirst = filter === 'all' && hasTeams;
  const entries: LeaderboardEntry[] = teamFirst
    ? teamEntries.map((e, i) => ({ ...e, rank: i + 1 }))
    : rawEntries;

  return (
    <div className="space-y-4">
      {/* Sponsor branding */}
      {league.league_branding && (
        <div className="p-3 rounded-lg bg-muted/50 flex items-center gap-3">
          {league.league_branding.sponsor_logo_url && (
            <img src={league.league_branding.sponsor_logo_url} alt="" className="h-8 object-contain" />
          )}
          {league.league_branding.sponsor_name && (
            <span className="text-xs text-muted-foreground">Sponsored by {league.league_branding.sponsor_name}</span>
          )}
        </div>
      )}

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
        <div>
          <Label className="text-xs">View</Label>
          <div className="flex gap-1 mt-0.5">
            {(['all', 'individuals', 'teams'] as const).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} className="h-8 text-xs capitalize" onClick={() => setFilter(f)}>
                {f}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No leaderboard data yet. Scores need to be submitted and rounds closed.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              {!leaderboard?.handicap_active && <TableHead className="text-right">Gross</TableHead>}
              <TableHead className="text-right">Net</TableHead>
              <TableHead className="text-right">Par</TableHead>
              <TableHead className="text-right">vs Par</TableHead>
              <TableHead className="text-right">Final</TableHead>
              <TableHead className="text-right">Rounds</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const vsPar = entry.final_vs_par ?? entry.net_vs_par ?? 0;
              const vsParLabel = vsPar === 0 ? "E" : vsPar > 0 ? `+${vsPar}` : `${vsPar}`;
              const vsParClass = vsPar < 0 ? "text-emerald-600" : vsPar > 0 ? "text-red-600" : "text-muted-foreground";
              const colSpanForDetail = leaderboard?.handicap_active ? 9 : 10;
              const isExpanded = expandedEntry === entry.id;
              const expandable = entry.type === 'team' || entry.breakdown.length > 0;
              return (
                <>
                  <TableRow
                    key={entry.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setExpandedEntry(expandedEntry === entry.id ? null : entry.id)}
                  >
                    <TableCell className="px-2">
                      {expandable ? (
                        <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
                      ) : null}
                    </TableCell>
                    <TableCell className="font-semibold">{entry.rank}</TableCell>
                    <TableCell>
                      <div>
                        <span className="font-medium text-sm">{entry.name}</span>
                        {entry.team_name && <p className="text-xs text-muted-foreground">{entry.team_name}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={entry.type === 'team' ? 'default' : 'outline'} className="text-xs">
                        {entry.type === 'team' ? '🏆 Team' : '👤 Individual'}
                      </Badge>
                    </TableCell>
                    {!leaderboard?.handicap_active && <TableCell className="text-right">{entry.total_gross}</TableCell>}
                    <TableCell className="text-right">{entry.total_net}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{entry.total_par ?? '—'}</TableCell>
                    <TableCell className={cn("text-right font-semibold", vsParClass)}>{vsParLabel}</TableCell>
                    <TableCell className="text-right font-semibold">{entry.final_score}</TableCell>
                    <TableCell className="text-right">{entry.rounds_played}</TableCell>
                  </TableRow>

                  {isExpanded && (
                    <TableRow key={`${entry.id}-detail`}>
                      <TableCell colSpan={colSpanForDetail} className="bg-muted/20 p-4">
                        <div className="space-y-3">
                          {entry.breakdown.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Round Breakdown</p>
                              <div className="flex gap-3 flex-wrap">
                                {entry.breakdown.map((b) => {
                                  const rVs = b.net_vs_par ?? 0;
                                  const rLabel = rVs === 0 ? "E" : rVs > 0 ? `+${rVs}` : `${rVs}`;
                                  const rClass = rVs < 0 ? "text-emerald-600" : rVs > 0 ? "text-red-600" : "text-muted-foreground";
                                  return (
                                    <div key={b.round} className="border rounded px-3 py-1.5 text-xs bg-background">
                                      <span className="font-medium">R{b.round}</span>: Gross {b.gross}, Net {b.net}
                                      {b.par ? <span className="text-muted-foreground"> (Par {b.par})</span> : null}
                                      {b.net_vs_par !== undefined && (
                                        <span className={cn("ml-1 font-semibold", rClass)}>{rLabel}</span>
                                      )}
                                      {b.handicap > 0 && <span className="text-muted-foreground"> · HC -{b.handicap}</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {entry.type === 'team' && entry.members && entry.members.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Team Members</p>
                              <div className="flex gap-3 flex-wrap">
                                {entry.members.map((m) => {
                                  const mvs = m.vs_par;
                                  const mvsStr = mvs === undefined || mvs === null ? '—' : mvs === 0 ? 'E' : mvs > 0 ? `+${mvs}` : `${mvs}`;
                                  const mvsCls = (mvs ?? 0) > 0 ? 'text-destructive' : (mvs ?? 0) < 0 ? 'text-emerald-600' : '';
                                  return (
                                    <div key={m.player_id} className="border rounded px-3 py-1.5 text-xs bg-background">
                                      <span className="font-medium">{m.name}</span>
                                      <span className="text-muted-foreground"> · Gross {m.gross_score ?? '—'} · Net {m.net_score} · Par {m.total_par ?? '—'} · </span>
                                      <span className={cn('font-semibold', mvsCls)}>vs Par {mvsStr}</span>
                                    </div>
                                  );
                                })}
                              </div>
                              {(league.fairness_factor_pct || 0) > 0 && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Fairness factor: -{league.fairness_factor_pct}% applied → Final: {entry.final_score}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </>
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
              <TabsTrigger value="feed">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="leaderboard">
              <Leaderboard leagueId={league.id} league={league} />
            </TabsContent>
            <TabsContent value="my-scores">
              <MyScores leagueId={league.id} />
            </TabsContent>
            <TabsContent value="feed">
              <LeagueFeed leagueId={league.id} />
            </TabsContent>
          </Tabs>
          {league.status === "active" && <ScoreEntryDialog leagueId={league.id} />}
        </CardContent>
      )}
    </Card>
  );
}

// ── My Scores ────────────────────────────────────────────────
function MyScores({ leagueId }: { leagueId: string }) {
  const { user } = useAuth();
  const { data: allScores, isLoading } = useLeagueScores(leagueId);
  const confirmScore = useConfirmScore(leagueId);

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin mx-auto" />;

  const myScores = (allScores || []).filter(s => s.player_id === user?.id);
  if (myScores.length === 0) return <p className="text-sm text-muted-foreground text-center py-4">No scores submitted yet.</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Round</TableHead>
          <TableHead>Total</TableHead>
          <TableHead>Method</TableHead>
          <TableHead>Status</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {myScores.map(s => (
          <TableRow key={s.id}>
            <TableCell>{s.round_number}</TableCell>
            <TableCell className="font-semibold">{s.total_score ?? "—"}</TableCell>
            <TableCell><Badge variant="secondary">{s.method}</Badge></TableCell>
            <TableCell>{s.confirmed_at ? <Badge>Confirmed</Badge> : <Badge variant="outline">Pending</Badge>}</TableCell>
            <TableCell>
              {!s.confirmed_at && (
                <Button size="sm" variant="outline" onClick={() => confirmScore.mutate({ score_id: s.id })} disabled={confirmScore.isPending}>
                  Confirm
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
