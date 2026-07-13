/**
 * League par resolution — mirrors the server-side rule in
 * supabase/functions/league-service/index.ts.
 *
 * A league round can have multiple valid Par grids: one per simulator
 * software (TGC vs GSPro) stored in `league_par_sets`. Each player's
 * effective Par depends on where they play — their `league_location`
 * carries the `software`. When a match is found we use that par set;
 * otherwise we fall back to the round's own `par_per_hole`.
 */

export interface ParResolverLocation {
  id: string;
  software?: string | null;
}

export interface ParResolverParSet {
  course_name: string | null;
  software: string | null;
  par_per_hole: number[] | null;
}

export interface ParResolverInput {
  /** Player's own location id, or their team's location id as fallback. */
  playerLocationId: string | null | undefined;
  /** The round's course_name (may be empty on unconfigured rounds). */
  roundCourseName: string | null | undefined;
  /** The round's fallback par_per_hole (used when no par set matches). */
  roundParPerHole: number[];
  /** All locations for the league (id → software). */
  locations: ParResolverLocation[];
  /** All par sets for the league. */
  parSets: ParResolverParSet[];
}

export interface ResolvedPar {
  par: number[];
  /** 'par-set' when a course+software match was found; 'round' when we fell back. */
  source: "par-set" | "round";
  /** Software name used for the match, if any. */
  software: string | null;
}

export function resolveLeaguePar(input: ParResolverInput): ResolvedPar {
  const { playerLocationId, roundCourseName, roundParPerHole, locations, parSets } = input;
  if (roundCourseName && playerLocationId) {
    const loc = locations.find((l) => l.id === playerLocationId);
    const sw = loc?.software || null;
    if (sw) {
      const match = parSets.find(
        (ps) => ps.course_name === roundCourseName && ps.software === sw,
      );
      if (match && Array.isArray(match.par_per_hole) && match.par_per_hole.length > 0) {
        return { par: match.par_per_hole, source: "par-set", software: sw };
      }
    }
  }
  return { par: roundParPerHole || [], source: "round", software: null };
}
