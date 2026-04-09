import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Razorpay webhook handler.
// Verifies the HMAC-SHA256 signature using the webhook secret stored per-city
// in payment_gateways.webhook_secret (or the RAZORPAY_WEBHOOK_SECRET env var as fallback).
// On payment.captured, logs the event and updates the related booking/order status.

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
  const eventId = payload.account_id
    ? `${payload.account_id}_${payload.created_at}`
    : `${eventType}_${razorpayPaymentId}_${Date.now()}`;

  // Determine which webhook secret to use.
  // Try per-city secret first (from payment_gateways table), then global env fallback.
  // We attempt to find a gateway that matches the order_id prefix if city is in notes.
  const notesCity = paymentEntity?.notes
    ? ((paymentEntity.notes as Record<string, unknown>)?.city as string | undefined)
    : undefined;

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
    // Mark any order/booking that carries this razorpay_order_id as payment_verified
    // Orders table uses razorpay_order_id column if it exists; bookings use metadata
    await adminClient
      .from("orders")
      .update({ payment_status: "paid", razorpay_payment_id: razorpayPaymentId })
      .eq("razorpay_order_id", razorpayOrderId);

    await adminClient
      .from("bookings")
      .update({ payment_status: "paid", razorpay_payment_id: razorpayPaymentId })
      .eq("razorpay_order_id", razorpayOrderId);
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
  }

  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
