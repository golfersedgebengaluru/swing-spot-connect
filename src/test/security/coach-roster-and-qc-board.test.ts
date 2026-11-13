import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseQCPublicBoard } from "@/hooks/useQuickCompetitions";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const migration = read("drizzle/migrations/0022_restrict_coach_rosters_and_competition_reads.sql");

describe("coach roster assignment", () => {
  it("removes coach self-assignment and re-pointing of roster links", () => {
    expect(migration).toMatch(/DROP POLICY IF EXISTS "Coaches manage their own students" ON public\.coach_students/);
    expect(migration).toMatch(/DROP POLICY IF EXISTS "Coaches update their own students" ON public\.coach_students/);
  });

  it("no longer offers roster management on the coach's own screen", () => {
    const src = read("src/components/coaching/CoachView.tsx");
    expect(src).not.toMatch(/ManageCoachStudents/);
  });
});

describe("quick competition public leaderboard", () => {
  it("drops table-wide public reads of players and attempts", () => {
    expect(migration).toMatch(/DROP POLICY IF EXISTS "qc players public read"/);
    expect(migration).toMatch(/DROP POLICY IF EXISTS "qc attempts public read"/);
  });

  it("serves one competition through a display-only function without internal columns", () => {
    const fn = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION public.qc_public_board"));
    expect(fn).toMatch(/WHERE p\.competition_id = _competition_id/);
    expect(fn).toMatch(/WHERE a\.competition_id = _competition_id/);
    expect(fn).not.toMatch(/created_by/);
  });

  it("public page reads the board function, not the tables", () => {
    const src = read("src/pages/QuickCompetitionPublic.tsx");
    expect(src).toMatch(/useQCPublicBoard/);
    expect(src).not.toMatch(/useQCPlayers|useQCAttempts/);
  });

  it("parses the board payload safely", () => {
    expect(parseQCPublicBoard(null)).toBeNull();
    expect(parseQCPublicBoard([])).toBeNull();
    expect(parseQCPublicBoard({})).toEqual({ players: [], attempts: [] });
    const board = parseQCPublicBoard({ players: [{ id: "p1" }], attempts: [{ id: "a1" }] });
    expect(board?.players).toHaveLength(1);
    expect(board?.attempts).toHaveLength(1);
  });
});
