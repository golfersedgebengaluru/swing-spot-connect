import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Trophy, Lock, Unlock, Trash2, Download, Sparkles, Star } from "lucide-react";
import {
  useSeasonWrapUp,
  useCompleteSeason,
  useReopenSeason,
  useCreateAward,
  useDeleteAward,
  useRecapCard,
} from "@/hooks/useLeagues";
import type { League, SeasonStandingEntry } from "@/types/league";

interface Props {
  league: League;
  players: { user_id: string; display_name: string | null; email?: string | null }[];
  isSiteAdmin: boolean;
}

function vsParBadge(v: number) {
  const label = v === 0 ? "E" : v > 0 ? `+${v}` : `${v}`;
  const cls = v < 0 ? "text-emerald-600" : v > 0 ? "text-rose-600" : "text-muted-foreground";
  return <span className={`font-mono font-semibold ${cls}`}>{label}</span>;
}

function StandingsTable({ rows, gross }: { rows: SeasonStandingEntry[]; gross?: boolean }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground py-4">No standings yet.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">#</TableHead>
          <TableHead>Player</TableHead>
          <TableHead className="text-right">{gross ? "Gross" : "Net"}</TableHead>
          <TableHead className="text-right">Par</TableHead>
          <TableHead className="text-right">vs Par</TableHead>
          <TableHead className="text-right">Rounds</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.player_id}>
            <TableCell className="font-semibold">{r.rank}</TableCell>
            <TableCell>{r.name}</TableCell>
            <TableCell className="text-right font-mono">{r.score}</TableCell>
            <TableCell className="text-right text-muted-foreground">{r.total_par}</TableCell>
            <TableCell className="text-right">{vsParBadge(r.vs_par)}</TableCell>
            <TableCell className="text-right text-muted-foreground">{r.rounds_played}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function RecapPreview({ leagueId, playerId }: { leagueId: string; playerId: string }) {
  const { data, isLoading } = useRecapCard(leagueId, playerId);
  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  if (!data?.url) return <p className="text-sm text-muted-foreground">No recap available.</p>;
  return (
    <div className="space-y-3">
      <div className="border rounded-lg overflow-hidden bg-muted">
        <img src={data.url} alt="Recap card" className="w-full" />
      </div>
      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline">
          <a href={data.url} download={`recap-${playerId}.svg`} target="_blank" rel="noopener noreferrer">
            <Download className="h-3.5 w-3.5 mr-1" /> Download
          </a>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            if (navigator.share && data.url) {
              try {
                await navigator.share({ title: "Season Recap", url: data.url });
              } catch {}
            } else if (data.url) {
              await navigator.clipboard.writeText(data.url);
            }
          }}
        >
          Share
        </Button>
      </div>
    </div>
  );
}

export function SeasonWrapUpPanel({ league, players, isSiteAdmin }: Props) {
  const { data: wrapUp, isLoading } = useSeasonWrapUp(league.id);
  const completeMut = useCompleteSeason(league.id);
  const reopenMut = useReopenSeason(league.id);
  const createAward = useCreateAward(league.id);
  const deleteAward = useDeleteAward(league.id);

  const [confirmComplete, setConfirmComplete] = useState(false);
  const [awardName, setAwardName] = useState("");
  const [awardWinner, setAwardWinner] = useState<string>("");
  const [awardDetail, setAwardDetail] = useState("");
  const [recapPlayerId, setRecapPlayerId] = useState<string | null>(null);

  const isCompleted = league.status === "completed";
  const snapshot = wrapUp?.snapshot;
  const auto = (wrapUp?.awards || []).filter((a) => !a.is_manual);
  const manual = (wrapUp?.awards || []).filter((a) => a.is_manual);
  const playerNameById = new Map(players.map((p) => [p.user_id, p.display_name || p.email || p.user_id.slice(0, 8)]));

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;

  return (
    <div className="space-y-4">
      {/* Header card with action */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              Season Wrap-Up
            </CardTitle>
            {snapshot && (
              <p className="text-xs text-muted-foreground mt-1">
                Completed {new Date(snapshot.completed_at).toLocaleString()}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {!isCompleted && (
              <Dialog open={confirmComplete} onOpenChange={setConfirmComplete}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Lock className="h-3.5 w-3.5 mr-1" /> Complete Season
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Complete this season?</DialogTitle>
                    <DialogDescription>
                      Once completed, scores and rounds are <strong>locked</strong>. Final standings will be frozen and
                      auto awards calculated. Only a site admin can re-open.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setConfirmComplete(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        completeMut.mutate(undefined, { onSuccess: () => setConfirmComplete(false) });
                      }}
                      disabled={completeMut.isPending}
                    >
                      {completeMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                      Confirm Complete
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            {isCompleted && isSiteAdmin && (
              <Button size="sm" variant="outline" onClick={() => reopenMut.mutate()} disabled={reopenMut.isPending}>
                <Unlock className="h-3.5 w-3.5 mr-1" /> Re-open Season
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      {!snapshot ? (
        <p className="text-sm text-muted-foreground py-4">
          Standings will appear here once the season is marked completed.
        </p>
      ) : (
        <>
          {/* Standings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Final Standings</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="net">
                <TabsList>
                  <TabsTrigger value="net">Net</TabsTrigger>
                  <TabsTrigger value="gross">Gross</TabsTrigger>
                </TabsList>
                <TabsContent value="net">
                  <StandingsTable rows={snapshot.net_standings} />
                </TabsContent>
                <TabsContent value="gross">
                  <StandingsTable rows={snapshot.gross_standings} gross />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Awards */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> Awards
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Auto</p>
                {auto.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No auto awards yet.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {auto.map((a) => (
                      <div key={a.id} className="border rounded p-2 flex items-start gap-2">
                        <Star className="h-4 w-4 text-amber-500 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{a.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {playerNameById.get(a.winner_player_id || "") || "—"}
                          </p>
                          {a.detail && <p className="text-xs text-muted-foreground">{a.detail}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Custom (admin-picked)</p>
                {manual.length === 0 ? (
                  <p className="text-sm text-muted-foreground mb-3">No custom awards.</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 mb-3">
                    {manual.map((a) => (
                      <div key={a.id} className="border rounded p-2 flex items-start gap-2">
                        <Trophy className="h-4 w-4 text-purple-500 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{a.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {playerNameById.get(a.winner_player_id || "") || "—"}
                          </p>
                          {a.detail && <p className="text-xs text-muted-foreground">{a.detail}</p>}
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => deleteAward.mutate(a.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add custom award */}
                <div className="grid gap-2 md:grid-cols-4 items-end border-t pt-3">
                  <div className="md:col-span-1">
                    <Label className="text-xs">Award name</Label>
                    <Input
                      placeholder="Spirit of the League"
                      value={awardName}
                      onChange={(e) => setAwardName(e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-1">
                    <Label className="text-xs">Winner</Label>
                    <Select value={awardWinner} onValueChange={setAwardWinner}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select player" />
                      </SelectTrigger>
                      <SelectContent>
                        {players.map((p) => (
                          <SelectItem key={p.user_id} value={p.user_id}>
                            {p.display_name || p.email || p.user_id.slice(0, 8)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-1">
                    <Label className="text-xs">Detail (optional)</Label>
                    <Input
                      placeholder="Best attitude all season"
                      value={awardDetail}
                      onChange={(e) => setAwardDetail(e.target.value)}
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!awardName || !awardWinner) return;
                      createAward.mutate(
                        { name: awardName, winner_player_id: awardWinner, detail: awardDetail || undefined },
                        {
                          onSuccess: () => {
                            setAwardName("");
                            setAwardWinner("");
                            setAwardDetail("");
                          },
                        },
                      );
                    }}
                    disabled={createAward.isPending || !awardName || !awardWinner}
                  >
                    Add Award
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recap cards */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recap Cards</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label className="text-xs">Preview a player's recap</Label>
                  <Select value={recapPlayerId || ""} onValueChange={setRecapPlayerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select player" />
                    </SelectTrigger>
                    <SelectContent>
                      {snapshot.net_standings.map((s) => (
                        <SelectItem key={s.player_id} value={s.player_id}>
                          #{s.rank} · {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {wrapUp?.sponsorship_enabled && wrapUp?.branding?.sponsor_name && (
                  <Badge variant="secondary">Sponsored: {wrapUp.branding.sponsor_name}</Badge>
                )}
              </div>
              {recapPlayerId && <RecapPreview leagueId={league.id} playerId={recapPlayerId} />}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
