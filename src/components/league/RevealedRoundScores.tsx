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
}: {
  leagueId: string;
  roundNumber: number;
  parPerHole: number[];
  hiddenHoles: number[];
  playerIds?: string[];
  showTeamTotal?: boolean;
  showPoints?: boolean;
}) {
  const { data: allScores, isLoading } = useLeagueScores(leagueId, roundNumber);
  const scores = playerIds
    ? (allScores || []).filter((s: any) => playerIds.includes(s.player_id))
    : allScores;
  const roundPar = parPerHole.reduce((s, p) => s + (Number(p) > 0 ? Number(p) : 0), 0);
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
    const gross = s.total_score ?? hs.reduce((a, v) => a + (Number(v) || 0), 0);
    const hiddenSum = hiddenHoles.reduce((sum, h) => sum + (Number(hs[h - 1]) || 0), 0);
    const handicap = roundPar > 0 && hiddenHoles.length > 0 ? hiddenSum * HC_MULT - roundPar : 0;
    const net = gross - handicap;
    const points = holeScoresToStableford(hs, parPerHole);
    return { id: s.id, name: s.player_name || s.player_id?.slice(0, 8), hs, gross, hiddenSum, handicap, net, points };
  });


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
                {Array.from({ length: parPerHole.length || (rows[0]?.hs.length ?? 0) }).map((_, i) => {
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
              {parPerHole.length > 0 && (
                <TableRow>
                  <TableHead className="text-[10px] text-muted-foreground">Par</TableHead>
                  {parPerHole.map((p, i) => (
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
                  {Array.from({ length: parPerHole.length || r.hs.length }).map((_, i) => {
                    const isHidden = hiddenHoles.includes(i + 1);
                    const v = r.hs[i];
                    const p = parPerHole[i];
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
                    {hiddenHoles.length > 0 && roundPar > 0 ? r.handicap : "—"}
                  </TableCell>
                  <TableCell className="text-center text-xs font-bold text-primary">
                    {hiddenHoles.length > 0 && roundPar > 0 ? r.net : "—"}
                  </TableCell>
                  <TableCell className="text-center text-xs font-bold text-emerald-600">
                    {formatPoints(r.points)}
                  </TableCell>
                </TableRow>
              ))}
              {showTeamTotal && rows.length > 1 && (() => {
                const holeCount = parPerHole.length || rows[0].hs.length;
                const holeTotals = Array.from({ length: holeCount }).map((_, i) =>
                  rows.reduce((sum, r) => sum + (Number(r.hs[i]) || 0), 0),
                );
                const teamGross = rows.reduce((s, r) => s + (r.gross || 0), 0);
                const teamPoints = rows.reduce((s, r) => s + (r.points || 0), 0);
                const teamHiddenSum = rows.reduce((s, r) => s + (r.hiddenSum || 0), 0);
                const teamHc = hiddenHoles.length > 0 && roundPar > 0
                  ? rows.reduce((s, r) => s + (r.handicap || 0), 0)
                  : 0;
                const teamNet = teamGross - teamHc;
                return (
                  <TableRow className="bg-primary/5 font-semibold">
                    <TableCell className="text-xs">Team Total</TableCell>
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
                    <TableCell className="text-center text-xs text-emerald-600">
                      {formatPoints(teamPoints)}
                    </TableCell>
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
