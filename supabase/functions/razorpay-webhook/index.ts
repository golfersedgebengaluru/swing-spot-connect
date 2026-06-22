import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  finalizeLegacyTeamRegistration,
  resolveOrCreateLegacyRegistration,
} from "../_shared/legacy-league-finalize.ts";
import { finalizeQcEntry } from "../_shared/qc-finalize.ts";

// Razorpay webhook handler.
// Verifies the HMAC-SHA256 signature using the webhook secret stored per-city
// in payment_gateways.webhook_secret (or the RAZORPAY_WEBHOOK_SECRET env var as fallback).
// On payment.captured / order.paid, logs the event, updates bookings/orders, AND
// reconciles hour purchases, guest bookings, and legacy league team registrations.

// Statuses considered "still recoverable" — anything except 'completed'. This lets
// a successful retry (or a webhook arriving after the browser timed out) finalize
// a row that was previously marked failed/webhook_error/etc.
const RECOVERABLE_STATUSES = ["pending", "failed", "webhook_error", "error", "signature_failed"];

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  // Read raw body — must be done before any JSON parsing to preserve signature integrity
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!signature) {
    console.error("[razorpay-webhook] Missing x-razorpay-signature header");
    // Return 200 so Razorpay does not auto-disable the endpoint on misconfig
    return new Response(JSON.stringify({ ok: false, error: "Missing signature" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Parse payload to get city/order info for per-city webhook secret lookup
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.error("[razorpay-webhook] Invalid JSON payload");
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON payload" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const eventType = payload.event as string | undefined;
  const payloadEntities = payload?.payload as any;
  const paymentEntity = payloadEntities?.payment?.entity as Record<string, unknown> | undefined;
  const orderEntity = payloadEntities?.order?.entity as Record<string, unknown> | undefined;

  // order_id may live on the payment entity OR (for order.paid) on the order entity
  const razorpayOrderId =
    (paymentEntity?.order_id as string | undefined) ??
    (orderEntity?.id as string | undefined);
  let razorpayPaymentId = paymentEntity?.id as string | undefined;
  const amountPaise =
    (paymentEntity?.amount as number | undefined) ??
    (orderEntity?.amount_paid as number | undefined);
  const currency =
    (paymentEntity?.currency as string | undefined) ??
    (orderEntity?.currency as string | undefined);
  const notes =
    (paymentEntity?.notes as Record<string, unknown> | undefined) ??
    (orderEntity?.notes as Record<string, unknown> | undefined);
  const eventId = payload.account_id
    ? `${payload.account_id}_${payload.created_at}`
    : `${eventType}_${razorpayPaymentId ?? razorpayOrderId}_${Date.now()}`;

  // Determine which webhook secret to use. Tenant-scoped (QC SaaS) wins, then city.
  const notesCity = notes?.city as string | undefined;
  const notesTenantId = notes?.tenant_id as string | undefined;

  let webhookSecret: string | null = null;
  let secretSource = "none";
  let gatewayCreds: { api_key: string | null; api_secret: string | null } | null = null;

  if (notesTenantId) {
    const { data: gw } = await adminClient
      .from("payment_gateways")
      .select("webhook_secret, api_key, api_secret")
      .eq("tenant_id", notesTenantId).eq("name", "razorpay").eq("is_active", true)
      .maybeSingle();
    webhookSecret = gw?.webhook_secret ?? null;
    if (webhookSecret) {
      secretSource = `payment_gateways:tenant:${notesTenantId}`;
      gatewayCreds = { api_key: gw?.api_key ?? null, api_secret: gw?.api_secret ?? null };
    }
  }

  if (!webhookSecret && notesCity) {
    const { data: gateway } = await adminClient
      .from("payment_gateways")
      .select("webhook_secret, api_key, api_secret")
      .eq("city", notesCity)
      .eq("name", "razorpay")
      .eq("is_active", true)
      .single();
    webhookSecret = gateway?.webhook_secret ?? null;
    if (webhookSecret) {
      secretSource = `payment_gateways:${notesCity}`;
      gatewayCreds = { api_key: gateway?.api_key ?? null, api_secret: gateway?.api_secret ?? null };
    }
  }

  // Fallback to global env var
  if (!webhookSecret) {
    webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? null;
    if (webhookSecret) secretSource = "env:RAZORPAY_WEBHOOK_SECRET";
  }

  console.log(`[razorpay-webhook] event=${eventType} order=${razorpayOrderId} city=${notesCity ?? "unknown"} secret_source=${secretSource} secret_len=${webhookSecret?.length ?? 0}`);

  if (!webhookSecret) {
    console.error(`[razorpay-webhook] No webhook secret configured for city=${notesCity ?? "unknown"}`);
    // Return 200 — don't let Razorpay auto-disable; admin must fix config
    return new Response(JSON.stringify({ ok: false, error: "Webhook secret not configured", city: notesCity ?? null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify HMAC-SHA256 signature
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const computedSignature = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison
  let sigValid = computedSignature.length === signature.length;
  if (sigValid) {
    let diff = 0;
    for (let i = 0; i < computedSignature.length; i++) {
      diff |= computedSignature.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    sigValid = diff === 0;
  }
  if (!sigValid) {
    console.error(`[razorpay-webhook] Invalid signature for event=${eventType} order=${razorpayOrderId} city=${notesCity ?? "unknown"} secret_source=${secretSource}`);
    // Return 200 to prevent Razorpay auto-disable; surface the failure in logs instead
    return new Response(JSON.stringify({ ok: false, error: "Invalid signature", city: notesCity ?? null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }


  // Idempotency check — skip already-processed events
  const { data: existing } = await adminClient
    .from("payment_events")
    .select("id")
    .eq("razorpay_event_id", eventId)
    .maybeSingle();

  if (existing) {
    return new Response(JSON.stringify({ status: "already_processed" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Log the event
  await adminClient.from("payment_events").insert({
    razorpay_event_id: eventId,
    event_type: eventType ?? "unknown",
    razorpay_payment_id: razorpayPaymentId ?? null,
    razorpay_order_id: razorpayOrderId ?? null,
    amount_paise: amountPaise ?? null,
    currency: currency ?? null,
    city: notesCity ?? null,
    raw_payload: payload,
  });

  // ── SUCCESS events ─────────────────────────────────────────────
  // Treat order.paid identically to payment.captured. Razorpay fires order.paid
  // when the order transitions to fully paid (e.g. on retry after a prior failure).
  const isSuccess = eventType === "payment.captured" || eventType === "order.paid";

  if (isSuccess && razorpayOrderId) {
    // If payment.id is missing (order.paid sometimes only carries the order entity),
    // ask Razorpay for the captured payment so downstream rows record a real id.
    if (!razorpayPaymentId && gatewayCreds?.api_key && gatewayCreds?.api_secret) {
      try {
        const auth = btoa(`${gatewayCreds.api_key}:${gatewayCreds.api_secret}`);
        const r = await fetch(
          `https://api.razorpay.com/v1/orders/${razorpayOrderId}/payments`,
          { headers: { Authorization: `Basic ${auth}` } },
        );
        if (r.ok) {
          const body = (await r.json()) as { items?: Array<{ id: string; status: string }> };
          const captured = body.items?.find((p) => p.status === "captured") ?? body.items?.[0];
          if (captured?.id) razorpayPaymentId = captured.id;
        }
      } catch (e) {
        console.error(`[razorpay-webhook] payment lookup failed for order=${razorpayOrderId}: ${(e as Error).message}`);
      }
    }

    // --- Mark bookings/orders as paid ---
    await adminClient
      .from("orders")
      .update({ payment_status: "paid", razorpay_payment_id: razorpayPaymentId })
      .eq("razorpay_order_id", razorpayOrderId);

    await adminClient
      .from("bookings")
      .update({ payment_status: "paid", razorpay_payment_id: razorpayPaymentId })
      .eq("razorpay_order_id", razorpayOrderId);

    // --- Reconcile hour package purchases ---
    const { data: pendingPurchase } = await adminClient
      .from("pending_purchases")
      .select("*")
      .eq("razorpay_order_id", razorpayOrderId)
      .in("status", RECOVERABLE_STATUSES)
      .maybeSingle();

    if (pendingPurchase) {
      console.log(`Webhook reconciling hour purchase for order ${razorpayOrderId} (prev status=${pendingPurchase.status})`);
      try {
        const description = `Purchased ${pendingPurchase.package_hours}h package (₹${pendingPurchase.package_price})`;
        const { error: rpcErr } = await adminClient.rpc("complete_hour_purchase", {
          p_user_id: pendingPurchase.user_id,
          p_hours: pendingPurchase.package_hours,
          p_amount: pendingPurchase.package_price,
          p_currency: pendingPurchase.currency,
          p_order_id: razorpayOrderId,
          p_payment_id: razorpayPaymentId || "webhook_reconciled",
          p_description: description,
          p_city: pendingPurchase.city,
        });

        if (rpcErr) {
          console.error("Webhook complete_hour_purchase failed:", rpcErr.message);
          await adminClient.from("pending_purchases").update({
            status: "webhook_error",
            error_message: rpcErr.message,
          }).eq("id", pendingPurchase.id);
        } else {
          console.log(`Webhook successfully reconciled purchase for user ${pendingPurchase.user_id}`);
          await adminClient.from("notifications").insert({
            user_id: pendingPurchase.user_id,
            title: "✅ Hours Credited",
            message: `${pendingPurchase.package_hours} hours have been added to your balance.`,
            type: "purchase",
          });
        }
      } catch (reconcileErr) {
        console.error("Webhook reconciliation error:", (reconcileErr as Error).message);
      }
    }

    // --- Reconcile guest bookings ---
    const { data: pendingGuest } = await adminClient
      .from("pending_guest_bookings")
      .select("*")
      .eq("razorpay_order_id", razorpayOrderId)
      .in("status", RECOVERABLE_STATUSES)
      .maybeSingle();

    if (pendingGuest) {
      console.log(`Webhook reconciling guest booking for order ${razorpayOrderId} (prev status=${pendingGuest.status})`);
      try {
        const invokeRes = await fetch(`${supabaseUrl}/functions/v1/calendar-sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            action: "guest_booking",
            start_time: pendingGuest.start_time,
            end_time: pendingGuest.end_time,
            duration_minutes: pendingGuest.duration_minutes,
            city: pendingGuest.city,
            bay_id: pendingGuest.bay_id,
            bay_name: pendingGuest.bay_name,
            session_type: pendingGuest.session_type,
            guest_name: pendingGuest.guest_name,
            guest_email: pendingGuest.guest_email,
            guest_phone: pendingGuest.guest_phone,
            calendar_email: pendingGuest.calendar_email,
            payment_id: razorpayPaymentId || "webhook_reconciled",
            order_id: razorpayOrderId,
            amount: pendingGuest.amount,
            currency: pendingGuest.currency,
            gateway_name: "razorpay",
            coupon_code: pendingGuest.coupon_code || null,
            discount_amount: pendingGuest.discount_amount || 0,
            original_amount: pendingGuest.original_amount || null,
          }),
        });

        if (!invokeRes.ok) {
          const errBody = await invokeRes.text();
          console.error("Webhook guest_booking invoke failed:", invokeRes.status, errBody);
          await adminClient.from("pending_guest_bookings").update({
            status: "webhook_error",
            error_message: `HTTP ${invokeRes.status}: ${errBody.slice(0, 500)}`,
          }).eq("id", pendingGuest.id);
        } else {
          console.log(`Webhook successfully reconciled guest booking for order ${razorpayOrderId}`);
          // calendar-sync will mark pending_guest_bookings.status = 'completed'
        }
      } catch (reconcileErr) {
        console.error("Webhook guest reconciliation error:", (reconcileErr as Error).message);
      }
    }

    // --- Reconcile legacy league team registrations (race-safe) ---
    const { data: pendingLeg } = await adminClient
      .from("pending_legacy_league_team_registrations")
      .select("*")
      .eq("razorpay_order_id", razorpayOrderId)
      .maybeSingle();

    if (pendingLeg) {
      console.log(`Webhook reconciling legacy league team for order ${razorpayOrderId} (prev status=${pendingLeg.status})`);
      try {
        const resolved = await resolveOrCreateLegacyRegistration(
          adminClient,
          pendingLeg,
          razorpayOrderId,
          razorpayPaymentId ?? null,
        );

        if (!resolved.reg) {
          console.error("Webhook legacy team resolve failed:", resolved.error);
          await adminClient.from("pending_legacy_league_team_registrations").update({
            status: "webhook_error",
            error_message: resolved.error ?? "resolve failed",
          }).eq("id", pendingLeg.id);
        } else {
          // Always mark pending → completed with the resolved registration id,
          // even if another finalizer inserted the row first. This stops the
          // browser/cron from looping on a "duplicate" pending row.
          await adminClient.from("pending_legacy_league_team_registrations").update({
            status: "completed",
            registration_id: resolved.reg.id,
            error_message: null,
          }).eq("id", pendingLeg.id);

          // Finalize is fully idempotent — safe to run from every finalizer.
          await finalizeLegacyTeamRegistration({
            admin: adminClient,
            supabaseUrl,
            serviceKey,
            origin: req.headers.get("origin") || req.headers.get("referer") || undefined,
            registrationId: resolved.reg.id,
            leagueId: pendingLeg.league_id,
            captainUserId: pendingLeg.captain_user_id,
            teamName: pendingLeg.team_name,
            teamSize: pendingLeg.team_size,
            locationId: pendingLeg.league_location_id ?? null,
            inviteEmails: Array.isArray(pendingLeg.invite_emails) ? pendingLeg.invite_emails : [],
            joinToken: (resolved.reg as any).join_token ?? null,
          });

          if (resolved.created) {
            await adminClient.from("notifications").insert({
              user_id: pendingLeg.captain_user_id,
              title: "✅ Team Registered",
              message: `Your team "${pendingLeg.team_name}" has been registered for the league.`,
              type: "league",
            });
          }
        }
      } catch (recErr) {
        console.error("Webhook legacy team reconciliation error:", (recErr as Error).message);
    }

    // --- Reconcile quick_competition entry payments ---
    // qc_entries is its own pending store (no separate pending_* table). The
    // shared finalizer does an atomic CAS so the browser, this webhook, and
    // the cron reconciler can race safely on the same order without creating
    // duplicate player rows.
    try {
      const qcResult = await finalizeQcEntry(adminClient, razorpayOrderId, razorpayPaymentId ?? null);
      if (qcResult) {
        console.log(`Webhook QC entry order=${razorpayOrderId} finalized=${qcResult.finalized} already_paid=${qcResult.alreadyPaid}`);
        if (qcResult.error) console.error("[razorpay-webhook] QC finalize error:", qcResult.error);
      }
    } catch (qcErr) {
      console.error("[razorpay-webhook] QC reconciliation error:", (qcErr as Error).message);
    }


    // Mark event as processed — ALWAYS, even if a sub-step above threw.
    // Wrapping in try/catch ensures one failed reconcile branch can't leave
    // payment_events.processed=false (which would block future replays).
    try {
      await adminClient.from("payment_events").update({ processed: true }).eq("razorpay_event_id", eventId);
    } catch (e) {
      console.error("[razorpay-webhook] failed to mark processed:", (e as Error).message);
    }
  }

  // ── FAILURE events ─────────────────────────────────────────────
  // IMPORTANT: Razorpay allows multiple payment attempts per order. A failed
  // attempt can be followed by a successful one on the SAME order_id. We
  // therefore must NOT mark pending_* rows as 'failed' here — doing so used
  // to permanently kill rows that would have been finalized by a later
  // payment.captured / order.paid event. The 30-minute cron in
  // reconcile-pending-payments is responsible for marking truly-dead rows
  // failed (it re-checks the live Razorpay order status before doing so).
  //
  // We DO still mark already-persisted `bookings` / `orders` rows failed
  // because those are downstream artifacts that should reflect attempt state.
  if (eventType === "payment.failed" && razorpayOrderId) {
    await adminClient
      .from("orders")
      .update({ payment_status: "failed" })
      .eq("razorpay_order_id", razorpayOrderId)
      .eq("payment_status", "pending");

    await adminClient
      .from("bookings")
      .update({ payment_status: "failed" })
      .eq("razorpay_order_id", razorpayOrderId)
      .eq("payment_status", "pending");

    console.log(`[razorpay-webhook] payment.failed for order=${razorpayOrderId} — leaving pending_* rows untouched so retries can finalize; cron will fail them after 30 min if order stays unpaid`);
  }

  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
