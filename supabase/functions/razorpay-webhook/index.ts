import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Razorpay webhook handler.
// Verifies the HMAC-SHA256 signature using the webhook secret stored per-city
// in payment_gateways.webhook_secret (or the RAZORPAY_WEBHOOK_SECRET env var as fallback).
// On payment.captured, logs the event, updates bookings/orders, AND reconciles hour purchases.

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
    return new Response(JSON.stringify({ error: "Missing signature" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Parse payload to get city/order info for per-city webhook secret lookup
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const eventType = payload.event as string | undefined;
  const paymentEntity = (payload?.payload as any)?.payment?.entity as Record<string, unknown> | undefined;
  const razorpayOrderId = paymentEntity?.order_id as string | undefined;
  const razorpayPaymentId = paymentEntity?.id as string | undefined;
  const amountPaise = paymentEntity?.amount as number | undefined;
  const currency = paymentEntity?.currency as string | undefined;
  const notes = paymentEntity?.notes as Record<string, unknown> | undefined;
  const eventId = payload.account_id
    ? `${payload.account_id}_${payload.created_at}`
    : `${eventType}_${razorpayPaymentId}_${Date.now()}`;

  // Determine which webhook secret to use.
  const notesCity = notes?.city as string | undefined;

  let webhookSecret: string | null = null;

  if (notesCity) {
    const { data: gateway } = await adminClient
      .from("payment_gateways")
      .select("webhook_secret")
      .eq("city", notesCity)
      .eq("name", "razorpay")
      .eq("is_active", true)
      .single();
    webhookSecret = gateway?.webhook_secret ?? null;
  }

  // Fallback to global env var
  if (!webhookSecret) {
    webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? null;
  }

  if (!webhookSecret) {
    console.error("No Razorpay webhook secret configured");
    return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
      status: 500,
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
  if (computedSignature.length !== signature.length) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  let diff = 0;
  for (let i = 0; i < computedSignature.length; i++) {
    diff |= computedSignature.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  if (diff !== 0) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 403,
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

  // Handle specific event types
  if (eventType === "payment.captured" && razorpayOrderId) {
    // --- Existing: Mark bookings/orders as paid ---
    await adminClient
      .from("orders")
      .update({ payment_status: "paid", razorpay_payment_id: razorpayPaymentId })
      .eq("razorpay_order_id", razorpayOrderId);

    await adminClient
      .from("bookings")
      .update({ payment_status: "paid", razorpay_payment_id: razorpayPaymentId })
      .eq("razorpay_order_id", razorpayOrderId);

    // --- NEW: Reconcile hour package purchases ---
    const { data: pendingPurchase } = await adminClient
      .from("pending_purchases")
      .select("*")
      .eq("razorpay_order_id", razorpayOrderId)
      .eq("status", "pending")
      .maybeSingle();

    if (pendingPurchase) {
      console.log(`Webhook reconciling hour purchase for order ${razorpayOrderId}`);
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
          
          // Notify user
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

    // --- NEW: Reconcile guest bookings (browser may have failed to call calendar-sync) ---
    const { data: pendingGuest } = await adminClient
      .from("pending_guest_bookings")
      .select("*")
      .eq("razorpay_order_id", razorpayOrderId)
      .eq("status", "pending")
      .maybeSingle();

    if (pendingGuest) {
      console.log(`Webhook reconciling guest booking for order ${razorpayOrderId}`);
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

    // --- NEW: Reconcile legacy league team registrations ---
    const { data: pendingLeg } = await adminClient
      .from("pending_legacy_league_team_registrations")
      .select("*")
      .eq("razorpay_order_id", razorpayOrderId)
      .eq("status", "pending")
      .maybeSingle();

    if (pendingLeg) {
      console.log(`Webhook reconciling legacy league team for order ${razorpayOrderId}`);
      try {
        const { data: reg, error: regErr } = await adminClient
          .from("legacy_league_team_registrations")
          .insert({
            league_id: pendingLeg.league_id,
            league_city_id: pendingLeg.league_city_id,
            league_location_id: pendingLeg.league_location_id,
            captain_user_id: pendingLeg.captain_user_id,
            team_name: pendingLeg.team_name,
            team_size: pendingLeg.team_size,
            total_amount: pendingLeg.amount,
            currency: pendingLeg.currency,
            payment_status: "paid",
            razorpay_order_id: razorpayOrderId,
            razorpay_payment_id: razorpayPaymentId,
          })
          .select()
          .single();

        if (regErr) {
          console.error("Webhook legacy team insert failed:", regErr.message);
          await adminClient.from("pending_legacy_league_team_registrations").update({
            status: regErr.code === "23505" ? "duplicate" : "webhook_error",
            error_message: regErr.message,
          }).eq("id", pendingLeg.id);
        } else {
          await adminClient.from("pending_legacy_league_team_registrations").update({
            status: "completed",
            registration_id: reg.id,
          }).eq("id", pendingLeg.id);

          await adminClient.from("notifications").insert({
            user_id: pendingLeg.captain_user_id,
            title: "✅ Team Registered",
            message: `Your team "${pendingLeg.team_name}" has been registered for the league.`,
            type: "league",
          });
        }
      } catch (recErr) {
        console.error("Webhook legacy team reconciliation error:", (recErr as Error).message);
      }
    }

    // Mark event as processed
    await adminClient.from("payment_events").update({ processed: true }).eq("razorpay_event_id", eventId);
  }

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

    // Mark pending purchase as failed
    await adminClient
      .from("pending_purchases")
      .update({ status: "failed", error_message: "Payment failed at gateway" })
      .eq("razorpay_order_id", razorpayOrderId)
      .eq("status", "pending");

    // Mark pending guest booking as failed
    await adminClient
      .from("pending_guest_bookings")
      .update({ status: "failed", error_message: "Payment failed at gateway" })
      .eq("razorpay_order_id", razorpayOrderId)
      .eq("status", "pending");
  }

  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
