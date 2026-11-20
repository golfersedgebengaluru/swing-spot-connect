// Finish a paid online checkout (member booking, guest booking or hour
// package) from its pending record. Shared by the Cashfree payment alert and
// confirm step; mirrors what razorpay-webhook does for Razorpay orders. Every
// step is idempotent, so alerts, the confirm step and the cron reconciler can
// race on the same order safely.

import { asCheckoutGateway, type CheckoutGatewayName } from "./gateway-credentials.ts";

export const RECOVERABLE_STATUSES = ["pending", "failed", "webhook_error", "error", "signature_failed"];

export type PendingTable = "pending_bookings" | "pending_guest_bookings" | "pending_purchases";

export interface PendingCheckout {
  table: PendingTable;
  // deno-lint-ignore no-explicit-any
  row: Record<string, any>;
  city: string;
  gateway: CheckoutGatewayName;
}

// deno-lint-ignore no-explicit-any
type Admin = any;

export interface FinalizeContext {
  admin: Admin;
  supabaseUrl: string;
  serviceKey: string;
  fetchImpl?: typeof fetch;
}

const TABLES: PendingTable[] = ["pending_bookings", "pending_guest_bookings", "pending_purchases"];

/** The checkout started with this gateway order id, in any status. */
export async function findPendingCheckout(admin: Admin, orderId: string): Promise<PendingCheckout | null> {
  for (const table of TABLES) {
    const { data } = await admin.from(table).select("*").eq("razorpay_order_id", orderId).maybeSingle();
    if (data) return { table, row: data, city: data.city, gateway: asCheckoutGateway(data.payment_gateway) };
  }
  return null;
}

/** calendar-sync answers 409 with `refunded` once it has recorded a refund for a slot that was gone. */
export function slotRefundRecorded(body: string): boolean {
  try {
    return typeof JSON.parse(body)?.refunded === "boolean";
  } catch {
    return false;
  }
}

export type FinalizeOutcome =
  | { status: "finalized" }
  | { status: "already_done" }
  | { status: "slot_unavailable" }
  | { status: "error"; error: string };

export async function finalizePaidCheckout(
  ctx: FinalizeContext,
  pending: PendingCheckout,
  paymentId: string | null,
): Promise<FinalizeOutcome> {
  const { admin, supabaseUrl, serviceKey } = ctx;
  const fetchImpl = ctx.fetchImpl ?? fetch;
  const { row, table } = pending;
  if (!RECOVERABLE_STATUSES.includes(row.status)) return { status: "already_done" };
  const orderId = row.razorpay_order_id as string;
  // Payment refs are unique in the revenue ledger; a placeholder could collide
  // with another order, so wait for the real one (the next alert or check has it).
  if (!paymentId) return { status: "error", error: "payment reference missing" };
  const paymentRef = paymentId;

  const callCalendarSync = (body: Record<string, unknown>) =>
    fetchImpl(`${supabaseUrl}/functions/v1/calendar-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify(body),
    });

  if (table === "pending_bookings") {
    const res = await callCalendarSync({ action: "finalize_pending_member_booking", razorpay_order_id: orderId, payment_id: paymentRef });
    if (res.status === 409) { await res.text(); return { status: "slot_unavailable" }; }
    if (!res.ok) return { status: "error", error: `member booking HTTP ${res.status}: ${(await res.text()).slice(0, 300)}` };
    await res.text();
    return { status: "finalized" };
  }

  if (table === "pending_guest_bookings") {
    const res = await callCalendarSync({
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
      payment_id: paymentRef,
      order_id: orderId,
      amount: row.amount,
      currency: row.currency,
      gateway_name: pending.gateway,
      coupon_code: row.coupon_code || null,
      discount_amount: row.discount_amount || 0,
      original_amount: row.original_amount || null,
    });
    const body = res.ok ? "" : await res.text();
    // The slot was gone and calendar-sync already refunded and recorded that: keep its outcome.
    if (res.status === 409 && slotRefundRecorded(body)) return { status: "slot_unavailable" };
    if (!res.ok) {
      const error = `HTTP ${res.status}: ${body.slice(0, 500)}`;
      const { error: updateError } = await admin.from("pending_guest_bookings")
        .update({ status: "webhook_error", error_message: error }).eq("id", row.id);
      if (updateError) console.error("[checkout-finalize] failed to mark guest booking webhook_error:", updateError.message);
      return { status: "error", error };
    }
    if (res.ok) await res.text();
    return { status: "finalized" };
  }

  const { data: purchase, error: rpcErr } = await admin.rpc("complete_hour_purchase", {
    p_user_id: row.user_id,
    p_hours: row.package_hours,
    p_amount: row.package_price,
    p_currency: row.currency,
    p_order_id: orderId,
    p_payment_id: paymentRef,
    p_description: `Purchased ${row.package_hours}h package (₹${row.package_price})`,
    p_city: row.city,
  });
  if (rpcErr) {
    const { error: updateError } = await admin.from("pending_purchases")
      .update({ status: "webhook_error", error_message: rpcErr.message }).eq("id", row.id);
    if (updateError) console.error("[checkout-finalize] failed to mark purchase webhook_error:", updateError.message);
    return { status: "error", error: rpcErr.message };
  }
  if (purchase?.already_completed) return { status: "already_done" };
  await admin.from("notifications").insert({
    user_id: row.user_id,
    title: "✅ Hours Credited",
    message: `${row.package_hours} hours have been added to your balance.`,
    type: "purchase",
  });
  return { status: "finalized" };
}
