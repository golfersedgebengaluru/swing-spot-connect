import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Play, Plus, Timer } from "lucide-react";
import {
  type QuickCompetition, type QCPlayer, type QCAttempt, type QCCategory,
  useAddPlayer, useSaveAttempt,
} from "@/hooks/useQuickCompetitions";

export function QCULDScoringCard({
  comp, players, attempts, categories,
}: {
  comp: QuickCompetition;
  players: QCPlayer[];
  attempts: QCAttempt[];
  categories: QCCategory[];
}) {
  const addPlayer = useAddPlayer(comp.id);
  const saveAttempt = useSaveAttempt(comp.id);

  const [playerId, setPlayerId] = useState<string>("");
  const [setNumber, setSetNumber] = useState<number>(1);
  const [showNewPlayer, setShowNewPlayer] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategoryId, setNewCategoryId] = useState<string>("__none");
  const [distance, setDistance] = useState("");
  const [offline, setOffline] = useState("");
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const tickRef = useRef<number | null>(null);

  const unitLabel = comp.unit === "yd" ? "yd" : "m";
  const totalSets = comp.uld_sets_per_player ?? 2;
  const shotsPerSet = comp.uld_shots_per_set ?? 6;
  const setDuration = comp.uld_set_duration_seconds ?? 150;
  const maxOffline = comp.uld_max_offline;

  // Auto-select a player if none chosen
  useEffect(() => {
    if (!playerId && players.length > 0) setPlayerId(players[0].id);
    if (playerId && !players.some((p) => p.id === playerId)) setPlayerId(players[0]?.id ?? "");
  }, [players, playerId]);

  // Tick the clock while a timer is running
  useEffect(() => {
    if (timerStartedAt === null) return;
    tickRef.current = window.setInterval(() => setNow(Date.now()), 250);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, [timerStartedAt]);

  const playerAttempts = useMemo(
    () => attempts.filter((a) => a.player_id === playerId),
    [attempts, playerId],
  );
  const setAttempts = useMemo(
    () => playerAttempts.filter((a) => (a.set_number ?? 0) === setNumber),
    [playerAttempts, setNumber],
  );
  const shotsRecorded = setAttempts.length;
  const nextShot = shotsRecorded + 1;
  const setComplete = shotsRecorded >= shotsPerSet;

  const elapsed = timerStartedAt ? Math.floor((now - timerStartedAt) / 1000) : 0;
  const remaining = Math.max(0, setDuration - elapsed);
  const timerExpired = timerStartedAt !== null && remaining === 0;
  const canEnter = !!playerId && !setComplete && timerStartedAt !== null && !timerExpired;

  const dNum = parseFloat(distance);
  const oNum = parseFloat(offline);
  const valid = canEnter && Number.isFinite(dNum) && dNum >= 0 && Number.isFinite(oNum) && oNum >= 0;

  function startTimer() {
    setTimerStartedAt(Date.now());
    setNow(Date.now());
  }

  function stopTimer() {
    setTimerStartedAt(null);
  }

  function startNextSet() {
    if (setNumber < totalSets) {
      setSetNumber(setNumber + 1);
      setTimerStartedAt(null);
      setDistance("");
      setOffline("");
    }
  }

  async function handleSave() {
    if (!valid || !playerId) return;
    const excluded = maxOffline != null && oNum > Number(maxOffline);
    await saveAttempt.mutateAsync({
      player_id: playerId,
      distance: dNum,
      offline: oNum,
      set_number: setNumber,
      shot_number: nextShot,
      excluded,
    });
    setDistance("");
    setOffline("");
  }

  async function handleAddPlayer() {
    const n = newName.trim();
    if (!n) return;
    const cat = comp.categories_enabled && newCategoryId !== "__none" ? newCategoryId : null;
    const created: { id?: string } = await addPlayer.mutateAsync({ name: n, category_id: cat });
    setNewName("");
    if (created?.id) {
      setPlayerId(created.id);
      setSetNumber(1);
      setTimerStartedAt(null);
    }
    setShowNewPlayer(false);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>ULD Scoring · Set {setNumber} of {totalSets}</span>
          <span className="flex items-center gap-2 text-xs font-normal">
            <Timer className="h-3.5 w-3.5" />
            <span className={`tabular-nums font-bold text-base ${timerExpired ? "text-destructive" : remaining < 30 && timerStartedAt ? "text-amber-600" : ""}`}>
              {String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}
            </span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs text-muted-foreground">Player</Label>
            <div className="flex gap-1">
              <Select value={playerId} onValueChange={(v) => { setPlayerId(v); setSetNumber(1); setTimerStartedAt(null); }}>
                <SelectTrigger className="h-9"><SelectValue placeholder={players.length === 0 ? "No players yet" : "Select player"} /></SelectTrigger>
                <SelectContent>
                  {players.map((p) => {
                    const cat = categories.find((c) => c.id === p.category_id);
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}{cat ? ` (${cat.name})` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {comp.entry_type === "free" && (
                <Button size="sm" variant={showNewPlayer ? "secondary" : "outline"} onClick={() => setShowNewPlayer((v) => !v)} title="Add new player">
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <div className="w-32">
            <Label className="text-xs text-muted-foreground">Set</Label>
            <Select value={String(setNumber)} onValueChange={(v) => { setSetNumber(parseInt(v, 10)); setTimerStartedAt(null); setDistance(""); setOffline(""); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: totalSets }, (_, i) => i + 1).map((s) => (
                  <SelectItem key={s} value={String(s)}>Set {s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {timerStartedAt === null && !setComplete && (
            <Button size="sm" onClick={startTimer} disabled={!playerId}>
              <Play className="h-4 w-4" /> Start Set {setNumber} ({setDuration}s)
            </Button>
          )}
          {timerStartedAt !== null && !timerExpired && (
            <Button size="sm" variant="outline" onClick={stopTimer}>Stop timer</Button>
          )}
          {(timerExpired || setComplete) && setNumber < totalSets && (
            <Button size="sm" onClick={startNextSet}>Start Set {setNumber + 1}</Button>
          )}
        </div>

        {showNewPlayer && (
          <div className="flex flex-wrap items-end gap-2 pt-2 border-t">
            <div className="flex-1 min-w-[180px]">
              <Label className="text-xs text-muted-foreground">New player name</Label>
              <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} className="h-9"
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddPlayer(); } }}
              />
            </div>
            {comp.categories_enabled && categories.length > 0 && (
              <div className="w-32">
                <Label className="text-xs text-muted-foreground">Category</Label>
                <Select value={newCategoryId} onValueChange={setNewCategoryId}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No category</SelectItem>
                    {categories.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button size="sm" onClick={handleAddPlayer} disabled={addPlayer.isPending || !newName.trim()}>
              {addPlayer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add player"}
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2 border-t pt-3">
          <div className="w-28">
            <Label className="text-xs text-muted-foreground">Shot</Label>
            <Input value={`${Math.min(nextShot, shotsPerSet)} / ${shotsPerSet}`} disabled className="h-9 font-medium" />
          </div>
          <div className="w-28">
            <Label className="text-xs text-muted-foreground">Distance ({unitLabel})</Label>
            <Input className="h-9" inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} disabled={!canEnter} />
          </div>
          <div className="w-28">
            <Label className="text-xs text-muted-foreground">Offline ({unitLabel})</Label>
            <Input className="h-9" inputMode="decimal" value={offline} onChange={(e) => setOffline(e.target.value)} disabled={!canEnter}
              onKeyDown={(e) => { if (e.key === "Enter" && valid) { e.preventDefault(); handleSave(); } }}
            />
          </div>
          <Button size="sm" onClick={handleSave} disabled={!valid || saveAttempt.isPending}>
            {saveAttempt.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save shot"}
          </Button>
        </div>

        {timerStartedAt === null && !setComplete && (
          <p className="text-xs text-muted-foreground">Press <strong>Start Set {setNumber}</strong> to begin the {setDuration}-second timer. Shots can only be recorded while the timer is running.</p>
        )}
        {timerExpired && !setComplete && (
          <p className="text-xs text-destructive">Time's up. {shotsRecorded} of {shotsPerSet} shots recorded for set {setNumber}. Remaining shots are not counted.</p>
        )}
        {setComplete && (
          <p className="text-xs text-muted-foreground">Set {setNumber} complete ({shotsRecorded}/{shotsPerSet}). {setNumber < totalSets ? `Press "Start Set ${setNumber + 1}".` : "All sets complete for this player."}</p>
        )}
        {maxOffline != null && (
          <p className="text-xs text-muted-foreground">Shots with offline greater than {Number(maxOffline)} {unitLabel} will be auto-excluded from the leaderboard.</p>
        )}
      </CardContent>
    </Card>
  );
}
