import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isAllowedAppOrigin, safeAppRedirect, PRIMARY_APP_ORIGIN } from "../../../supabase/functions/_shared/app-origins";
import { icsLinkLifetimeSeconds } from "../../../supabase/functions/_shared/ics-link";

const read = (p: string) => readFileSync(p, "utf8");

describe("password reset links", () => {
  it("only point at this app's own sites", () => {
    expect(safeAppRedirect("https://golfersedge.golf-collective.com/reset-password", "/reset-password")).toBe(`${PRIMARY_APP_ORIGIN}/reset-password`);
    expect(safeAppRedirect("https://swing-spot-connect.lovable.app/reset-password?x=1", "/reset-password")).toBe("https://swing-spot-connect.lovable.app/reset-password");
    expect(isAllowedAppOrigin("https://id-preview--373df412-22ca-43b5-8530-7e1b41956793.lovable.app")).toBe(true);
    for (const bad of ["https://evil.example/reset-password", "https://attacker.lovable.app/reset-password", "http://golfersedge.golf-collective.com/reset-password", "https://golfersedge.golf-collective.com/elsewhere", "javascript:alert(1)", 42]) {
      expect(safeAppRedirect(bad, "/reset-password")).toBe(`${PRIMARY_APP_ORIGIN}/reset-password`);
    }
  });

  it("never logs the typed email address", () => {
    expect(read("supabase/functions/request-password-reset/index.ts")).not.toMatch(/console\.\w+\([^)]*emailRaw/);
  });
});

describe("booking calendar links", () => {
  const now = new Date("2026-11-17T00:00:00Z");
  it("expire a day after the session, within bounds", () => {
    expect(icsLinkLifetimeSeconds("2026-11-18T00:00:00Z", now)).toBe(2 * 86400);
    expect(icsLinkLifetimeSeconds("2026-11-01T00:00:00Z", now)).toBe(3600);
    expect(icsLinkLifetimeSeconds("2027-11-01T00:00:00Z", now)).toBe(90 * 86400);
  });

  it("are removed when the booking is cancelled", () => {
    const src = read("supabase/functions/calendar-sync/index.ts");
    const start = src.indexOf("async function generateCancelCalendarUrl");
    expect(src.slice(start, start + 2000)).toMatch(/\.remove\(\[`\$\{bookingId\}\.ics`\]\)/);
  });
});

describe("league service", () => {
  const src = read("supabase/functions/league-service/index.ts");
  it("revokes join codes only within the route's league", () => {
    const start = src.indexOf("// Revoke a code: DELETE");
    const block = src.slice(start, start + 1500);
    expect(block).toMatch(/\.eq\('id', codeId\)\.eq\('league_id', route\.leagueId\)\.maybeSingle\(\)/);
    expect(block).toMatch(/update\(\{ revoked_at[\s\S]{0,120}\.eq\('league_id', route\.leagueId\)/);
  });

  it("limits team invite emails to confirmed captains and one invite per address per league", () => {
    const start = src.indexOf("route.action === 'legacy-register-team-intent'");
    const block = src.slice(start, start + 4000);
    expect(block).toMatch(/email_confirmed_at/);
    expect(block).toMatch(/Already invited to a team in this league/);
  });

  it("does not log invitee addresses", () => {
    expect(read("supabase/functions/_shared/legacy-league-finalize.ts")).not.toMatch(/invite insert failed:", email/);
  });
});
