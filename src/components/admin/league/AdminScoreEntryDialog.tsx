import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Plus } from "lucide-react";
import { useSubmitScore } from "@/hooks/useLeagues";
import type { League } from "@/types/league";
import type { LeaguePlayerWithProfile } from "@/hooks/useLeagues";
import { useToast } from "@/hooks/use-toast";

interface Props {
  league: League;
  players: LeaguePlayerWithProfile[];
}

/**
 * Admin score entry. Adapts hole-input semantics to the league format:
 * - stroke_play, scramble, best_ball, skins → strokes per hole (gross total)
 * - stableford → points per hole (sum = total points; higher is better but we still store sum)
 * - match_play → per-hole result encoded: 1=Win, 0=Halve, -1=Loss; total = match score (sum)
 *
 * For all formats we keep storage shape `hole_scores: number[]` + `total_score: number`,
 * matching the existing schema. The format meaning is documented per league.
 */
export function AdminScoreEntryDialog({ league, players }: Props) {
  const { toast } = useToast();
  const submit = useSubmitScore(league.id);

  const [open, setOpen] = useState(false);
  const [playerId, setPlayerId] = useState<string>("");
  const [round, setRound] = useState<number>(1);
  const numHoles = league.scoring_holes || 18;
  const [holes, setHoles] = useState<string[]>(() => Array(numHoles).fill(""));

  const format = league.format;

  const holeLabel = useMemo(() => {
    switch (format) {
      case "stableford":
        return "Points";
      case "match_play":
        return "Result";
      default:
        return "Strokes";
    }
  }, [format]);

  const total = useMemo(() => {
    return holes.reduce((s, v) => s + (Number(v) || 0), 0);
  }, [holes]);

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
    const minVal = 0;
    return (
      <Input
        type="number"
        min={minVal}
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
                <Input
                  type="number"
                  min={1}
                  value={round || ""}
                  onChange={(e) => setRound(Number(e.target.value) || 1)}
                />
              </div>
            </div>

            <div>
              <Label className="mb-2 block">
                Holes ({numHoles}) · {holeLabel}
              </Label>
              <div className="grid grid-cols-9 gap-1.5">
                {Array.from({ length: numHoles }).map((_, i) => (
                  <div key={i} className="space-y-1">
                    <div className="text-[10px] text-muted-foreground text-center">{i + 1}</div>
                    {renderHoleInput(i)}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded border p-3 bg-muted/40">
              <span className="text-sm font-medium">Total ({holeLabel})</span>
              <span className="text-lg font-bold">{total}</span>
            </div>

            {format === "match_play" && (
              <p className="text-xs text-muted-foreground">
                Enter per-hole result. Final total = wins − losses.
              </p>
            )}
            {format === "stableford" && (
              <p className="text-xs text-muted-foreground">
                Enter Stableford points per hole (typically 0–8). Higher total wins.
              </p>
            )}
            {(format === "stroke_play" || format === "scramble" || format === "best_ball" || format === "skins") && (
              <p className="text-xs text-muted-foreground">Enter strokes per hole. Lower total wins.</p>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submit.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submit.isPending || !playerId}>
            {submit.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Submit Score
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
