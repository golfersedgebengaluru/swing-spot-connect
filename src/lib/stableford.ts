/**
 * Modified Stableford points layer.
 *
 * Pure conversion: (strokes, par) → points. Used on top of the existing
 * stroke-based scoring (Best Ball / net / Peoria) without altering any of it.
 *
 * Tiers (per hole, based on strokes − par):
 *   ≤ −3 (albatross or better)  → +8
 *     −2 (eagle)                 → +5
 *     −1 (birdie)                → +2
 *      0 (par)                   →  0
 *     +1 (bogey)                 → −1
 *   ≥ +2 (double bogey or worse) → −2  ← capped
 */

export type StablefordTier =
  | "albatross"
  | "eagle"
  | "birdie"
  | "par"
  | "bogey"
  | "double_plus";

/** (strokes, par) → Modified Stableford points for a single hole. */
export function holeToStablefordPoints(strokes: number, par: number): number {
  if (!Number.isFinite(strokes) || strokes <= 0) return 0;
  if (!Number.isFinite(par) || par <= 0) return 0;
  const diff = strokes - par;
  if (diff <= -3) return 8;
  if (diff === -2) return 5;
  if (diff === -1) return 2;
  if (diff === 0) return 0;
  if (diff === 1) return -1;
  return -2;
}

/** Sum Modified Stableford points across a full round. */
export function holeScoresToStableford(
  holeScores: number[],
  parPerHole: number[],
): number {
  let total = 0;
  for (let i = 0; i < holeScores.length; i++) {
    total += holeToStablefordPoints(holeScores[i], parPerHole[i] ?? 0);
  }
  return total;
}

/** Classify a single hole for label rendering. */
export function classifyStablefordTier(
  strokes: number,
  par: number,
): StablefordTier | null {
  if (!Number.isFinite(strokes) || strokes <= 0) return null;
  if (!Number.isFinite(par) || par <= 0) return null;
  const diff = strokes - par;
  if (diff <= -3) return "albatross";
  if (diff === -2) return "eagle";
  if (diff === -1) return "birdie";
  if (diff === 0) return "par";
  if (diff === 1) return "bogey";
  return "double_plus";
}

/** Short label e.g. "Birdie", "Par", "+2", "+5" pts. */
export function tierLabel(tier: StablefordTier | null): string {
  switch (tier) {
    case "albatross": return "Albatross";
    case "eagle": return "Eagle";
    case "birdie": return "Birdie";
    case "par": return "Par";
    case "bogey": return "Bogey";
    case "double_plus": return "Dbl+";
    default: return "—";
  }
}

/** Format a points total with sign (e.g. "+14", "0", "−3"). */
export function formatPoints(pts: number): string {
  if (!Number.isFinite(pts) || pts === 0) return "0";
  return pts > 0 ? `+${pts}` : `${pts}`;
}

/**
 * Best-ball per-hole reducer: given several players' hole arrays (same length),
 * return the per-hole minimum (skipping 0 / missing values). Used to apply
 * Stableford to a team's best-ball line without changing the stroke aggregation.
 */
export function bestBallHoleScores(holeArrays: number[][]): number[] {
  if (holeArrays.length === 0) return [];
  const len = Math.max(...holeArrays.map((a) => a.length));
  const out: number[] = new Array(len).fill(0);
  for (let i = 0; i < len; i++) {
    let best = 0;
    for (const arr of holeArrays) {
      const v = arr[i];
      if (typeof v === "number" && v > 0 && (best === 0 || v < best)) best = v;
    }
    out[i] = best;
  }
  return out;
}
