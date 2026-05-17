import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const emailSrc = readFileSync(
  resolve(__dirname, "../../../supabase/functions/send-notification-email/index.ts"),
  "utf-8"
);
const leagueSrc = readFileSync(
  resolve(__dirname, "../../../supabase/functions/league-service/index.ts"),
  "utf-8"
);

describe("league team creation email wiring", () => {
  it("send-notification-email registers league_team_invite + league_team_created templates", () => {
    expect(emailSrc).toMatch(/league_team_invite:\s*\(d\)\s*=>/);
    expect(emailSrc).toMatch(/league_team_created:\s*\(d\)\s*=>/);
  });

  it("league templates appear in TEMPLATE_PREF_MAP (always-send)", () => {
    expect(emailSrc).toMatch(/league_team_invite:\s*"",/);
    expect(emailSrc).toMatch(/league_team_created:\s*"",/);
  });

  it("league templates are rate-limit exempt (critical notifications)", () => {
    expect(emailSrc).toMatch(/"league_team_invite"/);
    expect(emailSrc).toMatch(/"league_team_created"/);
  });

  it("league-service defines sendTeamCreationEmails helper", () => {
    expect(leagueSrc).toMatch(/async function sendTeamCreationEmails/);
    expect(leagueSrc).toMatch(/league-team-join\//);
  });

  it("league-service invokes sendTeamCreationEmails from BOTH free and paid finalize paths", () => {
    const matches = leagueSrc.match(/await sendTeamCreationEmails\(/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("league-service uses 'origin' header for branded join link", () => {
    expect(leagueSrc).toMatch(/req\.headers\.get\('origin'\)/);
  });

  it("email send failures are best-effort and don't block team creation", () => {
    // Helper uses Promise.allSettled — failures are swallowed/logged
    expect(leagueSrc).toMatch(/Promise\.allSettled/);
    // Finalize paths wrap email sending in try/catch
    expect(leagueSrc).toMatch(/\[league email\] finalize \(free\) failed/);
    expect(leagueSrc).toMatch(/\[league email\] finalize \(paid\) failed/);
  });
});
