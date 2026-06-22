// Cron-driven safety-net reconciler.
// Every few minutes, finds pending_guest_bookings / pending_purchases /
// pending_legacy_league_team_registrations older than RECONCILE_AGE_MIN that
// are still 'pending', asks Razorpay if the order was captured, and finalizes
// (or marks failed) accordingly. This protects against browser-side handler
// failures AND missing/late Razorpay webhooks.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { finalizeLegacyTeamRegistration, resolveOrCreateLegacyRegistration } from "../_shared/legacy-league-finalize.ts";

const RECONCILE_AGE_MIN = 3; // ignore very-fresh rows (browser may still be finalizing)
const MAX_AGE_HOURS = 24;    // stop trying after a day
// Recoverable = anything not yet finalized. Includes 'failed' so that a row
// previously marked failed by a payment.failed webhook can still be finalized
// if a later attempt on the same order succeeded.
const RECOVERABLE_STATUSES = ["pending", "failed", "webhook_error", "error", "signature_failed"];

interface RazorpayOrder {
  id: string;
  status: string; // 'created' | 'attempted' | 'paid'
  amount_paid: number;
}

interface RazorpayPayment {
  id: string;
  order_id: string;
  status: string; // 'captured' | 'failed' | 'authorized' | ...
}

async function fetchRazorpayOrder(
  orderId: string,
  keyId: string,
  keySecret: string,
): Promise<{ order: RazorpayOrder | null; payment: RazorpayPayment | null; error?: string }> {
  const auth = btoa(`${keyId}:${keySecret}`);
  const headers = { Authorization: `Basic ${auth}`, "Content-Type": "application/json" };

  const orderRes = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, { headers });
  if (!orderRes.ok) {
    return { order: null, payment: null, error: `order fetch ${orderRes.status}` };
  }
  const order = (await orderRes.json()) as RazorpayOrder;

  if (order.status !== "paid") {
    return { order, payment: null };
  }

  const paymentsRes = await fetch(
    `https://api.razorpay.com/v1/orders/${orderId}/payments`,
    { headers },
  );
  if (!paymentsRes.ok) {
    return { order, payment: null, error: `payments fetch ${paymentsRes.status}` };
  }
  const body = (await paymentsRes.json()) as { items: RazorpayPayment[] };
  const captured = body.items?.find((p) => p.status === "captured") ?? body.items?.[0] ?? null;
  return { order, payment: captured };
}

Deno.serve(async (req) => {
  // Allow either cron (no auth) or manual admin invocation
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const sinceIso = new Date(Date.now() - RECONCILE_AGE_MIN * 60_000).toISOString();
  const cutoffIso = new Date(Date.now() - MAX_AGE_HOURS * 3600_000).toISOString();

  const summary = {
    guest_bookings: { checked: 0, finalized: 0, failed: 0, still_pending: 0, errors: [] as string[] },
    hour_purchases: { checked: 0, finalized: 0, failed: 0, still_pending: 0, errors: [] as string[] },
    legacy_teams: { checked: 0, finalized: 0, failed: 0, still_pending: 0, errors: [] as string[] },
  };

  // Cache gateway creds per (city)
  const gatewayCache = new Map<string, { key_id: string; key_secret: string } | null>();
  async function getGateway(city: string) {
    if (gatewayCache.has(city)) return gatewayCache.get(city)!;
    const { data } = await admin
      .from("payment_gateways")
      .select("api_key, api_secret")
      .eq("city", city)
      .eq("name", "razorpay")
      .eq("is_active", true)
      .maybeSingle();
    const creds = data?.api_key && data?.api_secret
      ? { key_id: data.api_key as string, key_secret: data.api_secret as string }
      : null;
    gatewayCache.set(city, creds);
    return creds;
  }

  // ── 1. Guest bookings ──────────────────────────────────────────
  const { data: guestRows } = await admin
    .from("pending_guest_bookings")
    .select("*")
    .in("status", RECOVERABLE_STATUSES)
    .lt("created_at", sinceIso)
    .gt("created_at", cutoffIso)
    .limit(50);

  for (const row of guestRows ?? []) {
    summary.guest_bookings.checked++;
    try {
      const creds = await getGateway(row.city);
      if (!creds) {
        summary.guest_bookings.errors.push(`no gateway for ${row.city}`);
        continue;
      }
      const { order, payment, error } = await fetchRazorpayOrder(
        row.razorpay_order_id,
        creds.key_id,
        creds.key_secret,
      );
      if (error || !order) {
        summary.guest_bookings.errors.push(`${row.razorpay_order_id}: ${error}`);
        continue;
      }
      if (order.status !== "paid") {
        summary.guest_bookings.still_pending++;
        continue;
      }
      const invokeRes = await fetch(`${supabaseUrl}/functions/v1/calendar-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({
          action: "guest_booking",
          start_time: row.start_time,
          end_time: row.end_time,
          duration_minutes: row.duration_minutes,
          city: row.city,
          bay_id: row.bay_id,
          bay_name: row.bay_name,
          session_type: row.session_type,
          guest_name: row.guest_name,
          guest_email: row.guest_email,
          guest_phone: row.guest_phone,
          calendar_email: row.calendar_email,
          order_id: row.razorpay_order_id,
          payment_id: payment?.id ?? "cron_reconciled",
          amount: row.amount,
          currency: row.currency,
          gateway_name: "razorpay",
          coupon_code: row.coupon_code || null,
          discount_amount: row.discount_amount || 0,
          original_amount: row.original_amount || null,
        }),
      });
      if (invokeRes.ok) {
        summary.guest_bookings.finalized++;
      } else {
        const body = await invokeRes.text();
        summary.guest_bookings.errors.push(`${row.razorpay_order_id} invoke ${invokeRes.status}: ${body.slice(0, 200)}`);
      }
    } catch (e) {
      summary.guest_bookings.errors.push(`${row.razorpay_order_id}: ${(e as Error).message}`);
    }
  }

  // Also flip 'failed' for ones Razorpay confirms as not paid and older than 30 min
  const failCutoff = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data: maybeFailed } = await admin
    .from("pending_guest_bookings")
    .select("id, razorpay_order_id, city")
    .in("status", RECOVERABLE_STATUSES)
    .lt("created_at", failCutoff)
    .gt("created_at", cutoffIso)
    .limit(50);
  for (const row of maybeFailed ?? []) {
    const creds = await getGateway(row.city);
    if (!creds) continue;
    const { order } = await fetchRazorpayOrder(row.razorpay_order_id, creds.key_id, creds.key_secret);
    if (order && order.status !== "paid") {
      await admin.from("pending_guest_bookings").update({
        status: "failed",
        error_message: `Razorpay order status=${order.status} after 30 min`,
      }).eq("id", row.id);
      summary.guest_bookings.failed++;
    }
  }

  // ── 2. Hour purchases ──────────────────────────────────────────
  const { data: hpRows } = await admin
    .from("pending_purchases")
    .select("*")
    .in("status", RECOVERABLE_STATUSES)
    .lt("created_at", sinceIso)
    .gt("created_at", cutoffIso)
    .limit(50);

  for (const row of hpRows ?? []) {
    summary.hour_purchases.checked++;
    try {
      const creds = await getGateway(row.city);
      if (!creds) continue;
      const { order, payment } = await fetchRazorpayOrder(
        row.razorpay_order_id,
        creds.key_id,
        creds.key_secret,
      );
      if (!order || order.status !== "paid") {
        summary.hour_purchases.still_pending++;
        continue;
      }
      const { error: rpcErr } = await admin.rpc("complete_hour_purchase", {
        p_user_id: row.user_id,
        p_hours: row.package_hours,
        p_amount: row.package_price,
        p_currency: row.currency,
        p_order_id: row.razorpay_order_id,
        p_payment_id: payment?.id ?? "cron_reconciled",
        p_description: `Purchased ${row.package_hours}h package (cron-reconciled)`,
        p_city: row.city,
      });
      if (rpcErr) {
        summary.hour_purchases.errors.push(`${row.razorpay_order_id}: ${rpcErr.message}`);
      } else {
        summary.hour_purchases.finalized++;
      }
    } catch (e) {
      summary.hour_purchases.errors.push(`${row.razorpay_order_id}: ${(e as Error).message}`);
    }
  }

  // ── 3. Legacy league team registrations ────────────────────────
  const { data: legRows } = await admin
    .from("pending_legacy_league_team_registrations")
    .select("*")
    .in("status", RECOVERABLE_STATUSES)
    .lt("created_at", sinceIso)
    .gt("created_at", cutoffIso)
    .limit(50);

  for (const row of legRows ?? []) {
    summary.legacy_teams.checked++;
    try {
      // city resolution: league_city_id refers to bays.id? Look it up:
      const { data: city } = await admin
        .from("bays")
        .select("city")
        .eq("id", row.league_city_id)
        .maybeSingle();
      const cityName = city?.city as string | undefined;
      if (!cityName) {
        summary.legacy_teams.errors.push(`${row.razorpay_order_id}: no city`);
        continue;
      }
      const creds = await getGateway(cityName);
      if (!creds) continue;
      const { order, payment } = await fetchRazorpayOrder(
        row.razorpay_order_id,
        creds.key_id,
        creds.key_secret,
      );
      if (!order || order.status !== "paid") {
        summary.legacy_teams.still_pending++;
        continue;
      }
      const resolved = await resolveOrCreateLegacyRegistration(
        admin,
        row as any,
        row.razorpay_order_id,
        payment?.id ?? "cron_reconciled",
      );
      if (!resolved.reg) {
        summary.legacy_teams.errors.push(`${row.razorpay_order_id}: ${resolved.error ?? "resolve failed"}`);
        await admin.from("pending_legacy_league_team_registrations").update({
          status: "error",
          error_message: resolved.error ?? "resolve failed",
        }).eq("id", row.id);
      } else {
        await admin.from("pending_legacy_league_team_registrations").update({
          status: "completed",
          registration_id: resolved.reg.id,
          error_message: null,
        }).eq("id", row.id);

        await finalizeLegacyTeamRegistration({
          admin,
          supabaseUrl: Deno.env.get("SUPABASE_URL")!,
          serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          registrationId: resolved.reg.id,
          leagueId: row.league_id,
          captainUserId: row.captain_user_id,
          teamName: row.team_name,
          teamSize: row.team_size,
          locationId: row.league_location_id ?? null,
          inviteEmails: Array.isArray(row.invite_emails) ? row.invite_emails : [],
          joinToken: (resolved.reg as any).join_token ?? null,
        });

        summary.legacy_teams.finalized++;
      }
    } catch (e) {
      summary.legacy_teams.errors.push(`${row.razorpay_order_id}: ${(e as Error).message}`);
    }
  }

  return new Response(JSON.stringify({ ok: true, summary }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
