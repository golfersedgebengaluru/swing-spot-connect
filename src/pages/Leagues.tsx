import { useState } from "react";
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
import { Loader2, Trophy, LogIn, Plus, Camera, Upload } from "lucide-react";
import { Navigate } from "react-router-dom";
import { format } from "date-fns";
import {
  useLeagues,
  useTenants,
  useJoinLeague,
  useLeagueScores,
  useSubmitScore,
  useConfirmScore,
  useLeague,
} from "@/hooks/useLeagues";
import { supabase } from "@/integrations/supabase/client";
import type { League, LeagueScore } from "@/types/league";
import { useToast } from "@/hooks/use-toast";

// ── Join League Dialog ───────────────────────────────────────
function JoinLeagueDialog() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const joinLeague = useJoinLeague();

  const handleJoin = () => {
    if (!code.trim()) return;
    joinLeague.mutate(code.trim(), {
      onSuccess: () => { setOpen(false); setCode(""); },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><LogIn className="h-4 w-4 mr-2" /> Join League</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Join a League</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Join Code</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Enter your join code"
              className="font-mono text-lg tracking-widest"
              maxLength={12}
            />
          </div>
          <Button onClick={handleJoin} disabled={joinLeague.isPending} className="w-full">
            {joinLeague.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Join League
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Score Entry Dialog ───────────────────────────────────────
function ScoreEntryDialog({ leagueId }: { leagueId: string }) {
  const [open, setOpen] = useState(false);
  const [holeCount, setHoleCount] = useState(18);
  const [scores, setScores] = useState<number[]>(Array(18).fill(0));
  const [roundNumber, setRoundNumber] = useState(1);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrUsed, setOcrUsed] = useState(false);
  const submitScore = useSubmitScore(leagueId);
  const { toast } = useToast();

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

// ── Leaderboard ──────────────────────────────────────────────
function Leaderboard({ leagueId, league }: { leagueId: string; league: League }) {
  const { data: scores, isLoading } = useLeagueScores(leagueId);

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin mx-auto" />;
  if (!scores || scores.length === 0) return <p className="text-sm text-muted-foreground text-center py-8">No scores yet. Be the first to submit!</p>;

  // Aggregate best score per player
  const playerBest = new Map<string, LeagueScore>();
  scores.filter(s => s.confirmed_at).forEach(s => {
    const existing = playerBest.get(s.player_id);
    if (!existing || (s.total_score !== null && (existing.total_score === null || s.total_score < existing.total_score))) {
      playerBest.set(s.player_id, s);
    }
  });

  const ranked = [...playerBest.values()].sort((a, b) => (a.total_score ?? 999) - (b.total_score ?? 999));

  return (
    <div>
      {/* Sponsor branding header */}
      {league.league_branding && (
        <div className="mb-4 p-3 rounded-lg bg-muted/50 flex items-center gap-3">
          {league.league_branding.sponsor_logo_url && (
            <img src={league.league_branding.sponsor_logo_url} alt="" className="h-8 object-contain" />
          )}
          {league.league_branding.sponsor_name && (
            <span className="text-xs text-muted-foreground">Sponsored by {league.league_branding.sponsor_name}</span>
          )}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Player</TableHead>
            <TableHead>Best Score</TableHead>
            <TableHead>Round</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ranked.map((s, i) => (
            <TableRow key={s.id}>
              <TableCell className="font-bold">{i + 1}</TableCell>
              <TableCell>{(s as any).player_name || s.player_id.slice(0, 8)}</TableCell>
              <TableCell className="font-semibold">{s.total_score ?? "—"}</TableCell>
              <TableCell>{s.round_number}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── League Card ──────────────────────────────────────────────
function LeagueCard({ league }: { league: League }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
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
              <MyScores leagueId={league.id} />
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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold font-display">My Leagues</h1>
            <p className="text-sm text-muted-foreground">Compete, track scores, and climb the leaderboard</p>
          </div>
          <JoinLeagueDialog />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (!leagues || leagues.length === 0) ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Trophy className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <h3 className="font-semibold text-lg mb-1">No leagues yet</h3>
              <p className="text-sm text-muted-foreground mb-4">Ask your league admin for a join code to get started.</p>
              <JoinLeagueDialog />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {leagues.map(l => <LeagueCard key={l.id} league={l} />)}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
