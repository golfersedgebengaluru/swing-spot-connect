import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trophy, Target, Trash2, Plus, ExternalLink, Flag, Loader2, Image as ImageIcon, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  useQuickCompetition, useQCPlayers, useQCAttempts, useQCRealtime,
  useAddPlayer, useRemovePlayer, useSaveAttempt, useDeleteAttempt, useEndQuickCompetition,
  useUpdateQuickCompetition, useDeleteQuickCompetition,
  buildLeaderboards,
} from "@/hooks/useQuickCompetitions";

export function QuickCompetitionConsole({ competitionId, onClose }: { competitionId: string; onClose: () => void }) {
  const { data: comp } = useQuickCompetition(competitionId);
  const { data: players = [] } = useQCPlayers(competitionId);
  const { data: attempts = [] } = useQCAttempts(competitionId);
  useQCRealtime(competitionId);

  const addPlayer = useAddPlayer(competitionId);
  const removePlayer = useRemovePlayer(competitionId);
  const saveAttempt = useSaveAttempt(competitionId);
  const deleteAttempt = useDeleteAttempt(competitionId);
  const endComp = useEndQuickCompetition();

  const [newName, setNewName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { distance: string; offline: string }>>({});

  if (!comp) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const unitLabel = comp.unit === "yd" ? "yd" : "m";
  const isCompleted = comp.status === "completed";
  const { longest, straightest } = buildLeaderboards(players, attempts);

  const attemptsByPlayer = attempts.reduce<Record<string, typeof attempts>>((acc, a) => {
    (acc[a.player_id] ||= []).push(a);
    return acc;
  }, {});

  const publicUrl = `${window.location.origin}/qc/${competitionId}`;

  async function handleSave(playerId: string) {
    const d = drafts[playerId];
    if (!d) return;
    const dist = parseFloat(d.distance);
    const off = parseFloat(d.offline);
    if (!Number.isFinite(dist) || dist < 0 || !Number.isFinite(off) || off < 0) return;
    await saveAttempt.mutateAsync({ player_id: playerId, distance: dist, offline: off });
    setDrafts((prev) => ({ ...prev, [playerId]: { distance: "", offline: "" } }));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">{comp.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={isCompleted ? "secondary" : "default"}>{isCompleted ? "Completed" : "Live"}</Badge>
            <span className="text-xs text-muted-foreground">
              {comp.max_attempts >= 999 ? "Unlimited attempts" : `Up to ${comp.max_attempts} attempts`} · {unitLabel}
            </span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" asChild>
            <a href={publicUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" /> Bay-screen view
            </a>
          </Button>
          {!isCompleted && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="default" disabled={attempts.length === 0}>
                  <Flag className="h-4 w-4" /> End Competition
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>End this competition?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Winners will be locked in and shareable result cards will be generated. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => endComp.mutate(competitionId)}>End and declare winners</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>

      {isCompleted && (
        <div className="grid gap-4 sm:grid-cols-2">
          {comp.longest_card_url && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" /> Longest Drive</CardTitle></CardHeader>
              <CardContent>
                <img src={comp.longest_card_url} alt="Longest drive winner" className="w-full rounded border" />
                <Button size="sm" variant="outline" className="mt-2 w-full" asChild>
                  <a href={comp.longest_card_url} download target="_blank" rel="noopener noreferrer">
                    <ImageIcon className="h-4 w-4" /> Download / Share
                  </a>
                </Button>
              </CardContent>
            </Card>
          )}
          {comp.straightest_card_url && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4 text-sky-500" /> Straightest Drive</CardTitle></CardHeader>
              <CardContent>
                <img src={comp.straightest_card_url} alt="Straightest drive winner" className="w-full rounded border" />
                <Button size="sm" variant="outline" className="mt-2 w-full" asChild>
                  <a href={comp.straightest_card_url} download target="_blank" rel="noopener noreferrer">
                    <ImageIcon className="h-4 w-4" /> Download / Share
                  </a>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Add players + record attempts */}
      {!isCompleted && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Add player</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newName.trim()) return;
                addPlayer.mutate(newName, { onSuccess: () => setNewName("") });
              }}
            >
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Player name" />
              <Button type="submit" size="sm" disabled={addPlayer.isPending || !newName.trim()}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {players.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Players & attempts</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead>Best dist.</TableHead>
                  <TableHead>Best offline</TableHead>
                  <TableHead>Attempts</TableHead>
                  {!isCompleted && <TableHead>New attempt ({unitLabel})</TableHead>}
                  {!isCompleted && <TableHead></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {players.map((p) => {
                  const pAttempts = attemptsByPlayer[p.id] ?? [];
                  const bestDist = pAttempts.reduce((m, a) => Math.max(m, Number(a.distance)), 0);
                  const bestOff = pAttempts.length ? pAttempts.reduce((m, a) => Math.min(m, Number(a.offline)), Infinity) : null;
                  const reachedMax = comp.max_attempts < 999 && pAttempts.length >= comp.max_attempts;
                  const draft = drafts[p.id] ?? { distance: "", offline: "" };
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{pAttempts.length ? `${bestDist.toFixed(1)} ${unitLabel}` : "—"}</TableCell>
                      <TableCell>{bestOff !== null ? `${bestOff.toFixed(1)} ${unitLabel}` : "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[260px]">
                          {pAttempts.map((a) => (
                            <button
                              key={a.id}
                              onClick={() => deleteAttempt.mutate(a.id)}
                              disabled={isCompleted}
                              title="Click to delete attempt"
                              className="text-xs px-1.5 py-0.5 rounded bg-muted hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 disabled:hover:bg-muted"
                            >
                              {Number(a.distance).toFixed(0)}/{Number(a.offline).toFixed(0)}
                              {!isCompleted && <Trash2 className="inline h-3 w-3 ml-1" />}
                            </button>
                          ))}
                          {pAttempts.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                      {!isCompleted && (
                        <>
                          <TableCell>
                            <div className="flex gap-1">
                              <Input
                                className="w-20 h-8"
                                placeholder="dist"
                                inputMode="decimal"
                                value={draft.distance}
                                onChange={(e) => setDrafts((s) => ({ ...s, [p.id]: { ...draft, distance: e.target.value } }))}
                                disabled={reachedMax}
                              />
                              <Input
                                className="w-20 h-8"
                                placeholder="offline"
                                inputMode="decimal"
                                value={draft.offline}
                                onChange={(e) => setDrafts((s) => ({ ...s, [p.id]: { ...draft, offline: e.target.value } }))}
                                disabled={reachedMax}
                              />
                            </div>
                            {reachedMax && <p className="text-xs text-muted-foreground mt-1">Max attempts reached</p>}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                onClick={() => handleSave(p.id)}
                                disabled={reachedMax || !draft.distance || !draft.offline || saveAttempt.isPending}
                              >
                                Save
                              </Button>
                              {pAttempts.length === 0 && (
                                <Button size="sm" variant="ghost" onClick={() => removePlayer.mutate(p.id)} title="Remove player">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Live mini leaderboards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" /> Longest drive</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {longest.length === 0 ? <p className="text-xs text-muted-foreground">No attempts yet</p> :
              longest.slice(0, 5).map((r, i) => (
                <div key={r.player_id} className="flex justify-between text-sm">
                  <span><span className="text-muted-foreground mr-2">#{i + 1}</span>{r.name}</span>
                  <span className="font-medium">{r.value.toFixed(1)} {unitLabel}</span>
                </div>
              ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Target className="h-4 w-4 text-sky-500" /> Straightest drive</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {straightest.length === 0 ? <p className="text-xs text-muted-foreground">No attempts yet</p> :
              straightest.slice(0, 5).map((r, i) => (
                <div key={r.player_id} className="flex justify-between text-sm">
                  <span><span className="text-muted-foreground mr-2">#{i + 1}</span>{r.name}</span>
                  <span className="font-medium">{r.value.toFixed(1)} {unitLabel}</span>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
