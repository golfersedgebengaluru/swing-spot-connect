import { describe, it, expect } from "vitest";
import {
  isAllowedTeamSize,
  validateRegistrationForm,
} from "../useLegacyLeagueRegistration";

describe("isAllowedTeamSize", () => {
  it("accepts a size present in the allowed list", () => {
    expect(isAllowedTeamSize(4, [2, 4, 6])).toBe(true);
  });
  it("rejects a size not in the allowed list", () => {
    expect(isAllowedTeamSize(3, [2, 4, 6])).toBe(false);
  });
  it("rejects empty / null allowed lists", () => {
    expect(isAllowedTeamSize(4, [])).toBe(false);
    expect(isAllowedTeamSize(4, null)).toBe(false);
  });
  it("rejects non-integer or negative sizes", () => {
    expect(isAllowedTeamSize(0, [2, 4])).toBe(false);
    expect(isAllowedTeamSize(2.5, [2, 4])).toBe(false);
    expect(isAllowedTeamSize("abc", [2, 4])).toBe(false);
  });
  it("coerces numeric strings", () => {
    expect(isAllowedTeamSize("4", [2, 4])).toBe(true);
  });
});

describe("validateRegistrationForm", () => {
  const allowed = [2, 4, 6];
  const ok = {
    league_city_id: "c1",
    league_location_id: "l1",
    team_name: "Eagles",
    team_size: 4,
    allowed_team_sizes: allowed,
  };

  it("returns ok for a valid form", () => {
    expect(validateRegistrationForm(ok)).toEqual({ ok: true });
  });
  it("requires city", () => {
    const r = validateRegistrationForm({ ...ok, league_city_id: "" });
    expect(r).toEqual({ ok: false, error: "Please select a city" });
  });
  it("requires location", () => {
    const r = validateRegistrationForm({ ...ok, league_location_id: "" });
    expect(r).toEqual({ ok: false, error: "Please select a location" });
  });
  it("requires team name >= 2 chars (trimmed)", () => {
    const r = validateRegistrationForm({ ...ok, team_name: " a " });
    expect(r.ok).toBe(false);
  });
  it("rejects too-long team name", () => {
    const r = validateRegistrationForm({ ...ok, team_name: "x".repeat(120) });
    expect(r.ok).toBe(false);
  });
  it("rejects disallowed team size", () => {
    const r = validateRegistrationForm({ ...ok, team_size: 3 });
    expect(r).toEqual({ ok: false, error: "Please pick a valid team size" });
  });
  it("rejects missing team size", () => {
    const r = validateRegistrationForm({ ...ok, team_size: null });
    expect(r.ok).toBe(false);
  });
});
