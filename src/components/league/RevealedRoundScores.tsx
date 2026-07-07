import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLeagueScores } from "@/hooks/useLeagues";
import { holeToStablefordPoints, holeScoresToStableford, formatPoints } from "@/lib/stableford";


/**
 * Shared "closed-round / Peoria reveal" table — used by both the admin Rounds
 * panel and the player-facing Leagues page so users can see exactly which
 * holes were hidden, what every player scored, and the Peoria handicap once a
 * round has been closed.
 *
 * Peoria HC = (sum of hidden hole scores × 3) − round par
 */
export function RevealedRoundScores({
  leagueId,
  roundNumber,
  parPerHole,
  hiddenHoles,
  playerIds,
  showTeamTotal = false,
  showPoints = true,
  format,
  groupByTeam = false,
}: {
  leagueId: string;
  roundNumber: number;
  parPerHole: number[];
  hiddenHoles: number[];
  playerIds?: string[];
  showTeamTotal?: boolean;
  showPoints?: boolean;
  format?: string;
  groupByTeam?: boolean;
}) {
  const { data: allScores, isLoading } = useLeagueScores(leagueId, roundNumber);
  const scores = playerIds
    ? (allScores || []).filter((s: any) => playerIds.includes(s.player_id))
    : allScores;
  // Prefer per-player resolved par (course + player-location software) from
  // the server. Falls back to the round default `parPerHole` when missing.
  const resolvedParFor = (s: any): number[] => {
    const rp = Array.isArray(s?.resolved_par_per_hole) ? s.resolved_par_per_hole : [];
    return rp.length > 0 ? rp : parPerHole;
  };
  // Header "Par" row uses the majority per-player par (so viewers see the par
  // that matches most players) or falls back to the round default.
  const parCounts = new Map<string, { par: number[]; n: number }>();
  for (const s of (scores || [])) {
    const p = resolvedParFor(s);
    const key = p.join(",");
    const prev = parCounts.get(key);
    parCounts.set(key, { par: p, n: (prev?.n || 0) + 1 });
  }
  let displayPar = parPerHole;
  if (parCounts.size > 0) {
    let best = -1;
    for (const { par, n } of parCounts.values()) if (n > best) { best = n; displayPar = par; }
  }
  const roundPar = displayPar.reduce((s, p) => s + (Number(p) > 0 ? Number(p) : 0), 0);
  const HC_MULT = 3;

  if (isLoading) {
    return (
      <div className="rounded-md border p-3 bg-muted/20 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs text-muted-foreground">Loading scores…</span>
      </div>
    );
  }

  const rows = (scores || []).map((s: any) => {
    const hs: number[] = Array.isArray(s.hole_scores) ? s.hole_scores : [];
    const par = resolvedParFor(s);
    const parTotal = par.reduce((a, p) => a + (Number(p) > 0 ? Number(p) : 0), 0);
    const gross = s.total_score ?? hs.reduce((a, v) => a + (Number(v) || 0), 0);
    const hiddenSum = hiddenHoles.reduce((sum, h) => sum + (Number(hs[h - 1]) || 0), 0);
    const handicap = parTotal > 0 && hiddenHoles.length > 0 ? Math.max(0, hiddenSum * HC_MULT - parTotal) : 0;
    const net = gross - handicap;
    const points = holeScoresToStableford(hs, par);
    return { id: s.id, name: s.player_name || s.player_id?.slice(0, 8), team_id: s.team_id || null, team_name: s.team_name || null, hs, par, parTotal, gross, hiddenSum, handicap, net, points };
  });

  // Team grouping (admin view). Assign a stable color per team from a small palette.
  const TEAM_PALETTE = [
    { bar: "bg-sky-500",    tint: "bg-sky-50",    text: "text-sky-700",    border: "border-l-sky-500" },
    { bar: "bg-amber-500",  tint: "bg-amber-50",  text: "text-amber-700",  border: "border-l-amber-500" },
    { bar: "bg-emerald-500",tint: "bg-emerald-50",text: "text-emerald-700",border: "border-l-emerald-500" },
    { bar: "bg-violet-500", tint: "bg-violet-50", text: "text-violet-700", border: "border-l-violet-500" },
    { bar: "bg-rose-500",   tint: "bg-rose-50",   text: "text-rose-700",   border: "border-l-rose-500" },
    { bar: "bg-cyan-500",   tint: "bg-cyan-50",   text: "text-cyan-700",   border: "border-l-cyan-500" },
  ];
  const teamOrder: string[] = [];
  const teamNameById: Record<string, string> = {};
  for (const r of rows) {
    const key = r.team_id || "__none__";
    if (!teamOrder.includes(key)) teamOrder.push(key);
    if (r.team_id && r.team_name) teamNameById[r.team_id] = r.team_name;
  }
  const teamColorById: Record<string, typeof TEAM_PALETTE[number]> = {};
  let ci = 0;
  for (const key of teamOrder) {
    if (key === "__none__") continue;
    teamColorById[key] = TEAM_PALETTE[ci % TEAM_PALETTE.length];
    ci++;
  }
  const orderedRows = groupByTeam
    ? [...rows].sort((a, b) => {
        const ai = teamOrder.indexOf(a.team_id || "__none__");
        const bi = teamOrder.indexOf(b.team_id || "__none__");
        if (ai !== bi) return ai - bi;
        return a.name.localeCompare(b.name);
      })
    : rows;
  const totalCols = 1 + (displayPar.length || (rows[0]?.hs.length ?? 0)) + 4 + (showPoints ? 1 : 0);


  return (
    <div className="rounded-md border p-3 space-y-2 bg-card">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold">Player Scores & Peoria Handicaps</span>
        <Badge variant="outline" className="text-[10px]">Round Par {roundPar || "—"}</Badge>
        {hiddenHoles.length > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            Hidden: {hiddenHoles.join(", ")}
          </Badge>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No scores submitted for this round.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Player</TableHead>
                {Array.from({ length: displayPar.length || (rows[0]?.hs.length ?? 0) }).map((_, i) => {
                  const isHidden = hiddenHoles.includes(i + 1);
                  return (
                    <TableHead
                      key={i}
                      className={`text-center px-1.5 text-xs ${isHidden ? "bg-accent/30 text-accent-foreground" : ""}`}
                    >
                      {i + 1}
                    </TableHead>
                  );
                })}
                <TableHead className="text-center text-xs">Gross</TableHead>
                <TableHead className="text-center text-xs">Hidden Σ</TableHead>
                <TableHead className="text-center text-xs">Peoria HC</TableHead>
                <TableHead className="text-center text-xs">Net</TableHead>
                {showPoints && <TableHead className="text-center text-xs">Pts</TableHead>}
              </TableRow>
              {displayPar.length > 0 && (
                <TableRow>
                  <TableHead className="text-[10px] text-muted-foreground">Par</TableHead>
                  {displayPar.map((p, i) => (
                    <TableHead key={i} className="text-center px-1.5 text-[10px] text-muted-foreground font-normal">
                      {p || "—"}
                    </TableHead>
                  ))}
                  <TableHead className="text-center text-[10px] text-muted-foreground font-normal">{roundPar}</TableHead>
                  <TableHead colSpan={showPoints ? 4 : 3} />
                </TableRow>
              )}
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs font-medium">{r.name}</TableCell>
                  {Array.from({ length: r.par.length || displayPar.length || r.hs.length }).map((_, i) => {
                    const isHidden = hiddenHoles.includes(i + 1);
                    const v = r.hs[i];
                    const p = r.par[i] ?? displayPar[i];
                    const diff = typeof v === "number" && typeof p === "number" && p > 0 ? v - p : null;
                    const holePts = holeToStablefordPoints(Number(v) || 0, Number(p) || 0);
                    return (
                      <TableCell
                        key={i}
                        className={`text-center px-1.5 text-xs ${isHidden ? "bg-accent/30" : ""} ${
                          diff !== null && diff < 0 ? "text-green-600" : diff !== null && diff > 0 ? "text-destructive" : ""
                        }`}
                      >
                        <div>{v ?? "—"}</div>
                        {showPoints && p > 0 && v ? (
                          <div className="text-[9px] text-muted-foreground font-normal leading-none mt-0.5">
                            {formatPoints(holePts)}
                          </div>
                        ) : null}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-center text-xs font-semibold">{r.gross || "—"}</TableCell>
                  <TableCell className="text-center text-xs">{r.hiddenSum || "—"}</TableCell>
                  <TableCell className="text-center text-xs font-semibold">
                    {hiddenHoles.length > 0 && r.parTotal > 0 ? r.handicap : "—"}
                  </TableCell>
                  <TableCell className="text-center text-xs font-bold text-primary">
                    {hiddenHoles.length > 0 && r.parTotal > 0 ? r.net : "—"}
                  </TableCell>
                  {showPoints && (
                    <TableCell className="text-center text-xs font-bold text-emerald-600">
                      {formatPoints(r.points)}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {showTeamTotal && rows.length > 1 && (() => {
                const holeCount = displayPar.length || rows[0].hs.length;
                const isBestBall = format === "best_ball";
                // Per-hole team score: best_ball = min of members (>0); else = sum
                const holeTotals = Array.from({ length: holeCount }).map((_, i) => {
                  if (isBestBall) {
                    const vals = rows
                      .map((r) => Number(r.hs[i]) || 0)
                      .filter((v) => v > 0);
                    return vals.length ? Math.min(...vals) : 0;
                  }
                  return rows.reduce((sum, r) => sum + (Number(r.hs[i]) || 0), 0);
                });
                const teamGross = isBestBall
                  ? holeTotals.reduce((s, v) => s + (v || 0), 0)
                  : rows.reduce((s, r) => s + (r.gross || 0), 0);
                const teamHiddenSum = isBestBall
                  ? hiddenHoles.reduce((s, h) => s + (Number(holeTotals[h - 1]) || 0), 0)
                  : rows.reduce((s, r) => s + (r.hiddenSum || 0), 0);
                // Team handicap: best_ball = average of member handicaps (floored at 0);
                // else = sum (legacy behaviour for scramble/stroke_play)
                const teamHc = hiddenHoles.length > 0 && roundPar > 0
                  ? (isBestBall
                      ? Math.round(
                          (rows.reduce((s, r) => s + (r.handicap || 0), 0) / rows.length) * 100,
                        ) / 100
                      : rows.reduce((s, r) => s + (r.handicap || 0), 0))
                  : 0;
                const teamNet = teamGross - teamHc;
                const teamPoints = isBestBall
                  ? holeScoresToStableford(holeTotals, displayPar)
                  : rows.reduce((s, r) => s + (r.points || 0), 0);
                return (
                  <TableRow className="bg-primary/5 font-semibold">
                    <TableCell className="text-xs">
                      Team {isBestBall ? "(Best Ball)" : "Total"}
                    </TableCell>
                    {holeTotals.map((t, i) => (
                      <TableCell key={i} className="text-center px-1.5 text-xs">{t || "—"}</TableCell>
                    ))}
                    <TableCell className="text-center text-xs">{teamGross || "—"}</TableCell>
                    <TableCell className="text-center text-xs">{teamHiddenSum || "—"}</TableCell>
                    <TableCell className="text-center text-xs">
                      {hiddenHoles.length > 0 && roundPar > 0 ? teamHc : "—"}
                    </TableCell>
                    <TableCell className="text-center text-xs text-primary">
                      {hiddenHoles.length > 0 && roundPar > 0 ? teamNet : "—"}
                    </TableCell>
                    {showPoints && (
                      <TableCell className="text-center text-xs text-emerald-600">
                        {formatPoints(teamPoints)}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })()}

            </TableBody>
          </Table>
        </div>
      )}
      {hiddenHoles.length > 0 && roundPar > 0 && (
        <p className="text-[10px] text-muted-foreground">
          Peoria HC = (sum of hidden hole scores × {HC_MULT}) − round par ({roundPar})
        </p>
      )}
    </div>
  );
}
