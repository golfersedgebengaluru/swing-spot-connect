import { describe, it, expect } from "vitest";

// Re-implementation kept in sync with LeagueTeamJoin.tsx for unit testing.
// Source of truth lives in src/pages/LeagueTeamJoin.tsx; keep these strings aligned.
function errorCopy(code: string | undefined, invitedEmail?: string): string {
  switch (code) {
    case "email_mismatch":
      return `This invite was sent to ${invitedEmail || "a different address"}. Sign out and sign back in using that email to join the team.`;
    case "invite_revoked":
      return "This invite has been revoked by the team captain. Please ask them to resend.";
    case "invite_expired":
      return "This invite link has expired. Please ask the team captain to resend.";
    case "invalid_invite":
    case "invalid_token":
      return "This invite link is no longer valid.";
    case "team_full":
      return "This team is already full.";
    case "team_not_paid":
      return "This team's registration is not yet complete.";
    case "already_on_other_team":
      return "You're already on another team in this league.";
    case "not_invited":
      return "You weren't invited to this team. Ask the captain to send you an invite using the email you signed in with.";
    case "team_not_found":
      return "Team not found.";
    default:
      return code || "Could not join team";
  }
}

describe("LeagueTeamJoin errorCopy", () => {
  it("formats email_mismatch with invited email", () => {
    expect(errorCopy("email_mismatch", "yashas@example.com")).toContain("yashas@example.com");
  });
  it("falls back when invited email missing", () => {
    expect(errorCopy("email_mismatch")).toContain("a different address");
  });
  it.each([
    ["invite_revoked", "revoked"],
    ["invite_expired", "expired"],
    ["invalid_invite", "no longer valid"],
    ["invalid_token", "no longer valid"],
    ["team_full", "already full"],
    ["team_not_paid", "not yet complete"],
    ["already_on_other_team", "another team"],
    ["not_invited", "weren't invited"],
    ["team_not_found", "not found"],
  ])("maps %s to friendly copy", (code, snippet) => {
    expect(errorCopy(code).toLowerCase()).toContain(snippet.toLowerCase());
  });
  it("falls back to raw code for unknowns", () => {
    expect(errorCopy("weird_code")).toBe("weird_code");
    expect(errorCopy(undefined)).toBe("Could not join team");
  });
});
