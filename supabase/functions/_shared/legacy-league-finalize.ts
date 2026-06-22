// Shared helper: post-insert work for legacy league team registrations.
//
// When a `legacy_league_team_registrations` row is created (via the in-browser
// verify-team-payment path OR via the webhook / reconciler backstops), the
// captain must be added to `legacy_league_team_members`, invites must be
// persisted to `legacy_league_team_invites`, the new league_* mirror tables
// must be populated via `promote_legacy_team_member`, and email notifications
// must be sent to the captain + each invitee.
//
// Previously this logic lived only in the in-browser verify endpoint, so any
// payment that finalized via webhook (e.g. browser closed before handler ran)
// resulted in an "orphan" registration with no roster, no invites, no email,
// and the captain was shown the Create Team screen again on next login.

type AnyClient = {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
};

export interface LegacyTeamFinalizeInput {
  admin: AnyClient;
  supabaseUrl: string;
  serviceKey: string;
  origin?: string;
  registrationId: string;
  leagueId: string;
  captainUserId: string;
  teamName: string;
  teamSize: number;
  locationId: string | null;
  inviteEmails: string[];
  joinToken: string | null;
}

export async function finalizeLegacyTeamRegistration(input: LegacyTeamFinalizeInput) {
  const { admin } = input;

  // 1) Captain into roster (idempotent — ignore unique-violation)
  const { error: capErr } = await admin.from("legacy_league_team_members").insert({
    team_registration_id: input.registrationId,
    league_id: input.leagueId,
    user_id: input.captainUserId,
    role: "captain",
    joined_via: "captain",
  });
  if (capErr && capErr.code !== "23505") {
    console.error("[legacy-finalize] captain insert failed:", capErr.message);
  }

  // 2) Invites
  if (input.inviteEmails.length > 0) {
    const { error: invErr } = await admin.from("legacy_league_team_invites").insert(
      input.inviteEmails.map((email) => ({
        team_registration_id: input.registrationId,
        league_id: input.leagueId,
        email,
        invited_by: input.captainUserId,
        status: "pending",
      })),
    );
    if (invErr && invErr.code !== "23505") {
      console.error("[legacy-finalize] invites insert failed:", invErr.message);
    }
  }

  // 3) Bridge into new league_* tables so /leagues and admin Teams tab see it
  const { error: promErr } = await admin.rpc("promote_legacy_team_member", {
    _registration_id: input.registrationId,
    _user_id: input.captainUserId,
  });
  if (promErr) console.error("[legacy-finalize] promote_legacy_team_member failed:", promErr.message);

  // 4) Emails — best-effort, never throw
  try {
    const [{ data: captainProfile }, { data: lg }, { data: loc }] = await Promise.all([
      admin.from("profiles").select("email, display_name").eq("user_id", input.captainUserId).maybeSingle(),
      admin.from("leagues").select("name").eq("id", input.leagueId).maybeSingle(),
      input.locationId
        ? admin.from("league_locations").select("name").eq("id", input.locationId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const origin = (input.origin || "https://golfersedge.golf-collective.com").replace(/(https?:\/\/[^/]+).*/, "$1");
    const joinUrl = input.joinToken ? `${origin.replace(/\/$/, "")}/league-team-join/${input.joinToken}` : "";
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.serviceKey}`,
      apikey: input.serviceKey,
    };
    const post = (body: Record<string, unknown>) =>
      fetch(`${input.supabaseUrl}/functions/v1/send-notification-email`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      })
        .then((r) =>
          r.ok ? null : r.text().then((t) => console.error("[legacy-finalize email] failed", body.template, r.status, t)),
        )
        .catch((e) => console.error("[legacy-finalize email] error", body.template, e));

    const tasks: Promise<unknown>[] = [];
    const captainEmail = (captainProfile as any)?.email ?? null;
    const captainName = (captainProfile as any)?.display_name ?? null;
    const leagueName = (lg as any)?.name ?? "League";
    const locationName = (loc as any)?.name ?? null;

    if (captainEmail) {
      tasks.push(
        post({
          user_id: input.captainUserId,
          template: "league_team_created",
          subject: `Team "${input.teamName}" registered — ${leagueName}`,
          data: {
            display_name: captainName,
            league_name: leagueName,
            team_name: input.teamName,
            team_size: input.teamSize,
            invites_sent: input.inviteEmails.length,
            join_url: joinUrl,
          },
        }),
      );
    }
    for (const email of input.inviteEmails) {
      tasks.push(
        post({
          user_id: null,
          recipient_email: email,
          template: "league_team_invite",
          subject: `You've been added to "${input.teamName}" — ${leagueName}`,
          data: {
            captain_name: captainName,
            league_name: leagueName,
            team_name: input.teamName,
            location: locationName,
            join_url: joinUrl,
          },
        }),
      );
    }
    await Promise.allSettled(tasks);
  } catch (e) {
    console.error("[legacy-finalize] email block failed:", (e as Error).message);
  }
}
