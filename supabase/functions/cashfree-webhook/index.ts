// Cashfree payment alerts. Each order created by create-razorpay-order carries
// this function as its notify_url, so no dashboard set-up is needed.
// The city (and so the secret key that signs the alert) comes from our own
// pending checkout record, never from the alert body. Always answers 200 so
// Cashfree never disables the endpoint; problems are logged instead.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isCashfreeSuccess, parseCashfreeWebhook, verifyCashfreeSignature } from "../_shared/cashfree.ts";
import { finalizePaidCheckout, findPendingCheckout } from "../_shared/checkout-finalize.ts";
import { loadGatewayCredentials } from "../_shared/gateway-credentials.ts";

const reply = (payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const rawBody = await req.text();
  const signature = req.headers.get("x-webhook-signature") ?? "";
  const timestamp = req.headers.get("x-webhook-timestamp") ?? "";
  if (!signature || !timestamp) {
    console.error("[cashfree-webhook] Missing signature headers");
    return reply({ ok: false, error: "Missing signature" });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return reply({ ok: false, error: "Invalid JSON payload" });
  }
  const event = parseCashfreeWebhook(payload);
  if (!event.orderId) return reply({ ok: false, error: "No order in alert" });

  const pending = await findPendingCheckout(admin, event.orderId);
  if (!pending || pending.gateway !== "cashfree") {
    console.warn(`[cashfree-webhook] no Cashfree checkout for order=${event.orderId}`);
    return reply({ ok: false, error: "Unknown order" });
  }
  const creds = await loadGatewayCredentials(admin, pending.city, "cashfree");
  if (!creds) {
    console.error(`[cashfree-webhook] Cashfree keys missing for city=${pending.city}`);
    return reply({ ok: false, error: "Gateway not configured" });
  }
  if (!(await verifyCashfreeSignature(creds.keySecret, timestamp, rawBody, signature))) {
    console.error(`[cashfree-webhook] Invalid signature order=${event.orderId} city=${pending.city}`);
    return reply({ ok: false, error: "Invalid signature" });
  }

  const eventId = `cashfree:${event.type}:${event.paymentId ?? event.orderId}`;
  const { data: seen } = await admin.from("payment_events").select("id, processed").eq("razorpay_event_id", eventId).maybeSingle();
  if (seen?.processed) return reply({ status: "already_processed" });
  if (!seen) {
    await admin.from("payment_events").insert({
      razorpay_event_id: eventId,
      event_type: event.type,
      razorpay_payment_id: event.paymentId,
      razorpay_order_id: event.orderId,
      amount_paise: event.amount != null ? Math.round(event.amount * 100) : null,
      currency: event.currency,
      city: pending.city,
      raw_payload: payload,
    });
  }

  if (isCashfreeSuccess(event)) {
    const outcome = await finalizePaidCheckout({ admin, supabaseUrl, serviceKey }, pending, event.paymentId);
    console.log(`[cashfree-webhook] order=${event.orderId} outcome=${outcome.status}`);
    if (outcome.status === "error") {
      // Leave unprocessed so Cashfree's retry (or the cron reconciler) finishes it.
      console.error(`[cashfree-webhook] finalize failed order=${event.orderId}: ${outcome.error}`);
      return reply({ ok: false, error: "Finalization failed" });
    }
  } else {
    // Failed or abandoned attempts leave the checkout open: the customer may retry
    // on the same order, and the reconciler fails it once Cashfree says unpaid.
    console.log(`[cashfree-webhook] ${event.type} order=${event.orderId} — no change`);
  }

  const { error: processedError } = await admin.from("payment_events").update({ processed: true }).eq("razorpay_event_id", eventId);
  if (processedError) console.error("[cashfree-webhook] failed to mark event processed:", processedError.message);
  return reply({ status: "ok" });
});
