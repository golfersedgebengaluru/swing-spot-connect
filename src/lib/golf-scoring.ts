/**
 * Shared golf scoring helpers used by score entry, leaderboard, and tests.
 *
 * Conventions:
 * - `par` is the par value for a single hole (typically 3, 4, 5).
 * - `score` is the gross strokes taken on that hole.
 * - "Relative to par" = score - par. Negative = under par.
 *
 * Per-hole CAP rule (project requirement):
 *   The maximum stored score relative to par is +4. Anything worse than +4 is
 *   clamped to +4 for that hole. (e.g., scoring 9 on a par-4 → stored as 8.)
 *   This applies to gross stroke totals only — Stableford / Match Play handle
 *   their own per-hole semantics elsewhere.
 */

export const MAX_OVER_PAR_PER_HOLE = 4;

export type ParRelativeLabel =
  | "albatross"
  | "eagle"
  | "birdie"
  | "par"
  | "bogey"
  | "double_bogey"
  | "triple_plus";

/** Cap a single hole's gross score so it never exceeds par + 4. */
export function capHoleScore(score: number, par: number): number {
  if (!Number.isFinite(score) || score <= 0) return score;
  if (!Number.isFinite(par) || par <= 0) return score;
  const max = par + MAX_OVER_PAR_PER_HOLE;
  return Math.min(score, max);
}

/** Cap an entire round's hole scores against the round's par-per-hole array. */
export function capHoleScores(scores: number[], parPerHole: number[]): number[] {
  return scores.map((s, i) => {
    const par = parPerHole[i];
    return par > 0 ? capHoleScore(s, par) : s;
  });
}

/**
 * Classify a single hole's score relative to par.
 *  -3 or better → albatross
 *  -2           → eagle
 *  -1           → birdie
 *   0           → par
 *  +1           → bogey
 *  +2           → double_bogey
 *  +3 or worse  → triple_plus
 */
export function classifyHole(score: number, par: number): ParRelativeLabel | null {
  if (!Number.isFinite(score) || score <= 0) return null;
  if (!Number.isFinite(par) || par <= 0) return null;
  const diff = score - par;
  if (diff <= -3) return "albatross";
  if (diff === -2) return "eagle";
  if (diff === -1) return "birdie";
  if (diff === 0) return "par";
  if (diff === 1) return "bogey";
  if (diff === 2) return "double_bogey";
  return "triple_plus";
}

/** Sum of par across the configured holes (zeros / missing pars are ignored). */
export function totalPar(parPerHole: number[]): number {
  return parPerHole.reduce((s, p) => s + (p > 0 ? p : 0), 0);
}

/**
 * Total score relative to total par. Returns null when par is not configured.
 * Caller should apply per-hole caps first if desired.
 */
export function totalRelativeToPar(scores: number[], parPerHole: number[]): number | null {
  const par = totalPar(parPerHole);
  if (par <= 0) return null;
  const gross = scores.reduce((s, v) => s + (v || 0), 0);
  return gross - par;
}

/** Format relative score like "E", "−4", "+3". */
export function formatRelativeToPar(diff: number | null): string {
  if (diff === null || diff === undefined) return "";
  if (diff === 0) return "E";
  return diff > 0 ? `+${diff}` : `${diff}`;
}
