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

export interface PendingLegacyRow {
  id: string;
  league_id: string;
  league_city_id: string | null;
  league_location_id: string | null;
  captain_user_id: string;
  team_name: string;
  team_size: number;
  amount: number;
  original_amount?: number | null;
  discount_amount?: number | null;
  coupon_id?: string | null;
  coupon_code?: string | null;
  currency: string;
  invite_emails?: string[] | null;
  razorpay_order_id: string;
  status: string;
  registration_id?: string | null;
  gst_mode?: string | null;
  gst_rate?: number | null;
  sac_code?: string | null;
  taxable_amount?: number | null;
  gst_amount?: number | null;
}

export interface ResolvedRegistration {
  reg: any | null;
  created: boolean;
  error?: string;
}

/**
 * Race-safe lookup-or-insert for legacy_league_team_registrations.
 *
 * Multiple finalizers (browser verify-team-payment, razorpay-webhook,
 * reconcile-pending-payments cron) may attempt to finalize the SAME order
 * concurrently. They collide on either:
 *   - razorpay_order_id uniqueness, OR
 *   - legacy_league_team_unique_captain (league_id, captain_user_id).
 *
 * This helper:
 *   1. Returns any pre-existing row (by order_id) immediately.
 *   2. Attempts insert. If it succeeds → created=true.
 *   3. On 23505, re-SELECTs by order_id then (league_id, captain_user_id),
 *      backfilling order/payment id on the winner if missing.
 * Callers MUST run finalizeLegacyTeamRegistration afterwards regardless of
 * created — finalize is fully idempotent (members/invites ignore 23505).
 */
export async function resolveOrCreateLegacyRegistration(
  admin: AnyClient,
  pending: PendingLegacyRow,
  razorpayOrderId: string,
  razorpayPaymentId: string | null,
): Promise<ResolvedRegistration> {
  const { data: existing } = await admin
    .from("legacy_league_team_registrations")
    .select("*")
    .eq("razorpay_order_id", razorpayOrderId)
    .maybeSingle();
  if (existing) return { reg: existing, created: false };

  const { data: inserted, error: insErr } = await admin
    .from("legacy_league_team_registrations")
    .insert({
      league_id: pending.league_id,
      league_city_id: pending.league_city_id,
      league_location_id: pending.league_location_id,
      captain_user_id: pending.captain_user_id,
      team_name: pending.team_name,
      team_size: pending.team_size,
      total_amount: pending.amount,
      original_amount: pending.original_amount ?? pending.amount,
      discount_amount: pending.discount_amount ?? 0,
      coupon_id: pending.coupon_id ?? null,
      coupon_code: pending.coupon_code ?? null,
      currency: pending.currency,
      payment_status: "paid",
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      gst_mode: pending.gst_mode ?? null,
      gst_rate: pending.gst_rate ?? null,
      sac_code: pending.sac_code ?? null,
      taxable_amount: pending.taxable_amount ?? null,
      gst_amount: pending.gst_amount ?? null,
    })
    .select()
    .single();
  if (!insErr && inserted) return { reg: inserted, created: true };

  if (insErr && (insErr as any).code === "23505") {
    const { data: byOrder } = await admin
      .from("legacy_league_team_registrations")
      .select("*")
      .eq("razorpay_order_id", razorpayOrderId)
      .maybeSingle();
    if (byOrder) return { reg: byOrder, created: false };

    const { data: byCaptain } = await admin
      .from("legacy_league_team_registrations")
      .select("*")
      .eq("league_id", pending.league_id)
      .eq("captain_user_id", pending.captain_user_id)
      .maybeSingle();
    if (byCaptain) {
      if (!byCaptain.razorpay_order_id || !byCaptain.razorpay_payment_id) {
        await admin
          .from("legacy_league_team_registrations")
          .update({
            razorpay_order_id: byCaptain.razorpay_order_id ?? razorpayOrderId,
            razorpay_payment_id: byCaptain.razorpay_payment_id ?? razorpayPaymentId,
            payment_status: "paid",
          })
          .eq("id", byCaptain.id);
      }
      return { reg: byCaptain, created: false };
    }
  }

  return { reg: null, created: false, error: insErr?.message ?? "unknown insert failure" };
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

  // 2) Invites (upsert by team+email so retries don't dupe; ensures invite_token exists)
  if (input.inviteEmails.length > 0) {
    for (const email of input.inviteEmails) {
      const { error: invErr } = await admin.from("legacy_league_team_invites").insert({
        team_registration_id: input.registrationId,
        league_id: input.leagueId,
        email,
        invited_by: input.captainUserId,
        status: "pending",
      });
      if (invErr && invErr.code !== "23505") {
        console.error("[legacy-finalize] invite insert failed:", email, invErr.message);
      }
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
    // Per-invite token URLs — bulletproof: each invitee gets a unique, email-bound link
    const { data: inviteRows } = await admin
      .from("legacy_league_team_invites")
      .select("email, invite_token")
      .eq("team_registration_id", input.registrationId);
    const tokenByEmail = new Map<string, string>();
    for (const row of (inviteRows || []) as Array<{ email: string; invite_token: string }>) {
      tokenByEmail.set(row.email.toLowerCase(), row.invite_token);
    }
    for (const email of input.inviteEmails) {
      const inviteToken = tokenByEmail.get(email.toLowerCase());
      const inviteUrl = inviteToken
        ? `${origin.replace(/\/$/, "")}/league-team-join/i/${inviteToken}`
        : joinUrl;
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
            join_url: inviteUrl,
          },
        }),
      );
    }
    await Promise.allSettled(tasks);
  } catch (e) {
    console.error("[legacy-finalize] email block failed:", (e as Error).message);
  }
}
