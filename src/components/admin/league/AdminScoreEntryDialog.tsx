import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Plus } from "lucide-react";
import { useSubmitScore, useLeagueRounds } from "@/hooks/useLeagues";
import type { League } from "@/types/league";
import type { LeaguePlayerWithProfile } from "@/hooks/useLeagues";
import { useToast } from "@/hooks/use-toast";
import {
  capHoleScore,
  classifyHole,
  totalPar,
  totalRelativeToPar,
  formatRelativeToPar,
  MAX_OVER_PAR_PER_HOLE,
} from "@/lib/golf-scoring";

interface Props {
  league: League;
  players: LeaguePlayerWithProfile[];
}

const STROKE_FORMATS = ["stroke_play", "scramble", "best_ball", "skins"] as const;

const LABEL_CLASS: Record<string, string> = {
  albatross: "bg-purple-500/15 text-purple-600 border-purple-500/40",
  eagle: "bg-blue-500/15 text-blue-600 border-blue-500/40",
  birdie: "bg-emerald-500/15 text-emerald-600 border-emerald-500/40",
  par: "bg-muted text-muted-foreground border-border",
  bogey: "bg-orange-500/15 text-orange-600 border-orange-500/40",
  double_bogey: "bg-red-500/15 text-red-600 border-red-500/40",
  triple_plus: "bg-red-700/20 text-red-700 border-red-700/40",
};
const LABEL_SHORT: Record<string, string> = {
  albatross: "ALB",
  eagle: "EAG",
  birdie: "BIR",
  par: "PAR",
  bogey: "BOG",
  double_bogey: "DBL",
  triple_plus: "+3↑",
};

export function AdminScoreEntryDialog({ league, players }: Props) {
  const { toast } = useToast();
  const submit = useSubmitScore(league.id);
  const { data: rounds } = useLeagueRounds(league.id);

  const [open, setOpen] = useState(false);
  const [playerId, setPlayerId] = useState<string>("");
  const [round, setRound] = useState<number>(1);
  const numHoles = league.scoring_holes || 18;
  const [holes, setHoles] = useState<string[]>(() => Array(numHoles).fill(""));

  const format = league.format;
  const isStroke = (STROKE_FORMATS as readonly string[]).includes(format);

  const currentRound = useMemo(() => (rounds || []).find((r) => r.round_number === round), [rounds, round]);
  const parPerHole = currentRound?.par_per_hole || [];
  const parReady = parPerHole.length === numHoles && parPerHole.every((p) => p > 0);

  const holeLabel = useMemo(() => {
    switch (format) {
      case "stableford": return "Points";
      case "match_play": return "Result";
      default: return "Strokes";
    }
  }, [format]);

  // Cap-aware effective scores for display/total when stroke format + par configured
  const effectiveScores = useMemo(
    () => holes.map((v, i) => {
      const n = Number(v) || 0;
      if (!isStroke || !parReady) return n;
      return capHoleScore(n, parPerHole[i]);
    }),
    [holes, isStroke, parReady, parPerHole],
  );

  const total = useMemo(() => effectiveScores.reduce((s, v) => s + (v || 0), 0), [effectiveScores]);
  const relTotal = useMemo(
    () => (isStroke && parReady ? totalRelativeToPar(effectiveScores, parPerHole) : null),
    [isStroke, parReady, effectiveScores, parPerHole],
  );

  const reset = () => {
    setPlayerId("");
    setRound(1);
    setHoles(Array(numHoles).fill(""));
  };

  const handleSubmit = () => {
    if (!playerId) {
      toast({ title: "Pick a player", variant: "destructive" });
      return;
    }
    // Send raw values; the edge function applies the same per-hole cap server-side.
    const holeScores = holes.map((v) => Number(v) || 0);
    submit.mutate(
      {
        round_number: round,
        hole_scores: holeScores,
        method: "manual",
        player_id: playerId,
      },
      {
        onSuccess: () => {
          reset();
          setOpen(false);
        },
      },
    );
  };

  const renderHoleInput = (i: number) => {
    if (format === "match_play") {
      return (
        <Select
          value={holes[i] === "" ? "" : holes[i]}
          onValueChange={(v) => {
            const next = [...holes];
            next[i] = v;
            setHoles(next);
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">W (+1)</SelectItem>
            <SelectItem value="0">H (0)</SelectItem>
            <SelectItem value="-1">L (-1)</SelectItem>
          </SelectContent>
        </Select>
      );
    }
    const max = format === "stableford" ? 8 : 15;
    return (
      <Input
        type="number"
        min={0}
        max={max}
        value={holes[i]}
        onChange={(e) => {
          const next = [...holes];
          next[i] = e.target.value;
          setHoles(next);
        }}
        className="h-8 text-xs px-2"
      />
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5 mr-1" /> Add Score
      </Button>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Add Score · <span className="capitalize">{format.replace(/_/g, " ")}</span>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-3">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Player</Label>
                <Select value={playerId} onValueChange={setPlayerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select player" />
                  </SelectTrigger>
                  <SelectContent>
                    {(players || []).map((p) => (
                      <SelectItem key={p.id} value={p.user_id}>
                        {p.display_name || p.email || p.user_id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Round</Label>
                {rounds && rounds.length > 0 ? (
                  <Select value={String(round)} onValueChange={(v) => setRound(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {rounds.map((r) => (
                        <SelectItem key={r.id} value={String(r.round_number)}>
                          R{r.round_number}: {r.name}
                          {r.par_per_hole?.length === numHoles ? ` · Par ${totalPar(r.par_per_hole)}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input type="number" min={1} value={round || ""} onChange={(e) => setRound(Number(e.target.value) || 1)} />
                )}
              </div>
            </div>

            <div>
              <Label className="mb-2 block">
                Holes ({numHoles}) · {holeLabel}
                {isStroke && parReady && (
                  <span className="text-xs text-muted-foreground ml-2">
                    Par per hole shown · scores capped at par +{MAX_OVER_PAR_PER_HOLE}
                  </span>
                )}
              </Label>
              <div className="grid grid-cols-9 gap-1.5">
                {Array.from({ length: numHoles }).map((_, i) => {
                  const par = parPerHole[i];
                  const raw = Number(holes[i]) || 0;
                  const eff = effectiveScores[i];
                  const capped = isStroke && parReady && raw > 0 && eff !== raw;
                  const cls = isStroke && parReady && eff > 0 ? classifyHole(eff, par) : null;
                  return (
                    <div key={i} className="space-y-1">
                      <div className="text-[10px] text-muted-foreground text-center">
                        {i + 1}{isStroke && parReady ? <span className="ml-0.5 text-[9px]">·P{par}</span> : null}
                      </div>
                      {renderHoleInput(i)}
                      {cls && (
                        <div className={`text-[9px] text-center rounded border px-1 py-0.5 ${LABEL_CLASS[cls]}`}>
                          {LABEL_SHORT[cls]}
                          {capped && <span className="ml-0.5">⚑</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {isStroke && parReady && holes.some((h, i) => Number(h) > 0 && Number(h) !== effectiveScores[i]) && (
                <p className="text-[11px] text-muted-foreground mt-2">⚑ One or more holes were capped at par +{MAX_OVER_PAR_PER_HOLE}.</p>
              )}
            </div>

            <div className="flex items-center justify-between rounded border p-3 bg-muted/40">
              <span className="text-sm font-medium">
                Total ({holeLabel}){isStroke && parReady ? ` · Par ${totalPar(parPerHole)}` : ""}
              </span>
              <span className="text-lg font-bold">
                {total}
                {relTotal !== null && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({formatRelativeToPar(relTotal)})
                  </span>
                )}
              </span>
            </div>

            {format === "match_play" && (
              <p className="text-xs text-muted-foreground">Enter per-hole result. Final total = wins − losses.</p>
            )}
            {format === "stableford" && (
              <p className="text-xs text-muted-foreground">Enter Stableford points per hole (typically 0–8). Higher total wins.</p>
            )}
            {isStroke && (
              <p className="text-xs text-muted-foreground">
                Enter strokes per hole. Lower total wins. {parReady ? `Per-hole max = par + ${MAX_OVER_PAR_PER_HOLE}.` : "Set par on the round to see par-relative labels and capping."}
              </p>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submit.isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submit.isPending || !playerId}>
            {submit.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Submit Score
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
