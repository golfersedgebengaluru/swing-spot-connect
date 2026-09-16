import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const live = Boolean(url && key);
const migrationPath = path.resolve(process.cwd(), "supabase/migrations/20260916030313_6b8ce114-b2c8-4edc-8668-ba05c16ce9ad.sql");

describe("self-directed Training database security", () => {
  const migration = fs.readFileSync(migrationPath, "utf8");

  it("denies coach accounts in every owner policy and the completion operation", () => {
    expect(migration.match(/NOT public\.has_role\(auth\.uid\(\), 'coach'\)/g)?.length ?? 0).toBeGreaterThanOrEqual(7);
    expect(migration).toContain("IF public.has_role(v_user_id, 'coach') THEN");
    expect(migration).toContain("Self-directed training is unavailable for coach accounts");
  });

  it("keeps owner identity and session type immutable", () => {
    const original = fs.readFileSync(path.resolve(process.cwd(), "supabase/migrations/20260915061406_d01f601f-06cf-4891-bf37-5506be465d0c.sql"), "utf8");
    expect(original).toContain("trg_coaching_sessions_immutable_identity");
    expect(original).toContain("NEW.coach_user_id IS DISTINCT FROM OLD.coach_user_id");
    expect(original).toContain("NEW.student_user_id IS DISTINCT FROM OLD.student_user_id");
    expect(original).toContain("NEW.session_type IS DISTINCT FROM OLD.session_type");
  });

  it("accepts only existing cities and active mapped library selections", () => {
    expect(migration).toContain("FROM public.bays b WHERE b.city = v_city");
    expect(migration).toContain("f.active = true");
    expect(migration).toContain("d.active = true");
    expect(migration).toContain("JOIN public.focus_drills fd");
  });
});

describe.skipIf(!live)("self-directed Training anonymous operation denial", () => {
  const client = createClient(url ?? "", key ?? "");

  it("rejects the underlying completion operation without a signed-in user", async () => {
    const { error } = await client.rpc("complete_self_directed_training", {
      _session: { city: "Bengaluru", session_date: "2026-09-16" },
      _focuses: [],
      _drills: [],
    });
    expect(error).not.toBeNull();
  });

  it("cannot directly create a self-directed session", async () => {
    const { error } = await client.from("coaching_sessions").insert({
      coach_user_id: "00000000-0000-0000-0000-000000000001",
      student_user_id: "00000000-0000-0000-0000-000000000001",
      city: "Bengaluru",
      session_date: "2026-09-16",
      session_type: "self_directed",
    });
    expect(error).not.toBeNull();
  });
});