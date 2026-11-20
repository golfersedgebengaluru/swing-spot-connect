import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cashfreeCustomerPhone,
  cashfreeOrderBody,
  cashfreeRefundId,
  createCashfreeOrder,
  fetchCashfreeOrderPayment,
  isCashfreeOrderId,
  isCashfreeSuccess,
  newCashfreeOrderId,
  parseCashfreeWebhook,
  refundCashfreeOrder,
  verifyCashfreeSignature,
} from "../../../supabase/functions/_shared/cashfree";
import { credentialsFromRow } from "../../../supabase/functions/_shared/gateway-credentials";
import { finalizePaidCheckout, slotRefundRecorded, type PendingCheckout } from "../../../supabase/functions/_shared/checkout-finalize";
import { refundCheckoutPayment } from "../../../supabase/functions/_shared/app-availability";
import { checkoutSwitchMessage } from "../../../supabase/functions/_shared/payment-gateway-management";

const sandbox = { appId: "TEST_APP", secretKey: "test_secret", testMode: true };
const live = { ...sandbox, testMode: false };
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("Cashfree orders", () => {
  it("creates its own order ids that Cashfree accepts and we can recognise", () => {
    const id = newCashfreeOrderId("0F8E2A4C-1111-2222-3333-444455556666");
    expect(id).toBe("cf_0f8e2a4c111122223333444455556666");
    expect(id.length).toBeLessThanOrEqual(45);
    expect(isCashfreeOrderId(id)).toBe(true);
    expect(isCashfreeOrderId("order_Pxyz123")).toBe(false);
  });

  it("needs a usable mobile number for every customer", () => {
    expect(cashfreeCustomerPhone("98450 12345")).toBe("9845012345");
    expect(cashfreeCustomerPhone("+91 98450-12345")).toBe("9845012345");
    expect(cashfreeCustomerPhone("09845012345")).toBe("9845012345");
    expect(cashfreeCustomerPhone("+44 7911 123456")).toBe("+447911123456");
    expect(cashfreeCustomerPhone("12345")).toBeNull();
    expect(cashfreeCustomerPhone(null)).toBeNull();
  });

  it("charges the server-priced amount and routes payment alerts to our function", () => {
    const body = cashfreeOrderBody({
      orderId: "cf_x", amount: 1349.999, currency: "INR",
      customer: { id: "u_1", phone: "9845012345", name: "Asha", email: "a@x.in" },
      note: "Bay #1", tags: { city: "Chennai", purpose: "booking" },
      notifyUrl: "https://example.test/functions/v1/cashfree-webhook", expiresAt: "2026-11-20T10:16:00.000Z",
    });
    expect(body.order_amount).toBe(1350);
    expect(body.order_meta.notify_url).toMatch(/cashfree-webhook$/);
    expect(body.customer_details).toMatchObject({ customer_id: "u_1", customer_phone: "9845012345" });
  });

  it("uses the sandbox only in test mode and sends the account keys as headers", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ payment_session_id: "session_1" }));
    const input = {
      orderId: "cf_x", amount: 100, currency: "INR", customer: { id: "u", phone: "9845012345" },
      note: "", tags: {}, notifyUrl: "https://n", expiresAt: "2026-11-20T10:16:00Z",
    };
    expect(await createCashfreeOrder(sandbox, input, fetchImpl as unknown as typeof fetch)).toEqual({ ok: true, paymentSessionId: "session_1" });
    await createCashfreeOrder(live, input, fetchImpl as unknown as typeof fetch);
    const [[sandboxUrl, sandboxInit], [liveUrl]] = fetchImpl.mock.calls as unknown as [string, RequestInit][];
    expect(sandboxUrl).toBe("https://sandbox.cashfree.com/pg/orders");
    expect(liveUrl).toBe("https://api.cashfree.com/pg/orders");
    expect(sandboxInit.headers).toMatchObject({ "x-client-id": "TEST_APP", "x-client-secret": "test_secret", "x-api-version": "2023-08-01" });
  });

  it("reports a paid order with the successful payment's id", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith("/payments")
        ? jsonResponse([{ cf_payment_id: 111, payment_status: "FAILED" }, { cf_payment_id: 222, payment_status: "SUCCESS" }])
        : jsonResponse({ order_status: "PAID" }));
    expect(await fetchCashfreeOrderPayment(sandbox, "cf_a", fetchImpl as unknown as typeof fetch))
      .toEqual({ status: "paid", paid: true, paymentId: "222" });
  });

  it("reports an unpaid order as not paid without asking for payments", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ order_status: "ACTIVE" }));
    expect(await fetchCashfreeOrderPayment(sandbox, "cf_a", fetchImpl as unknown as typeof fetch))
      .toEqual({ status: "active", paid: false, paymentId: null });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refunds the full amount with a refund id fixed per order, so a retry cannot refund twice", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ refund_status: "PENDING" }));
    await refundCashfreeOrder(sandbox, { orderId: "cf_a", amount: 1200, note: "slot_unavailable" }, fetchImpl as unknown as typeof fetch);
    await refundCashfreeOrder(sandbox, { orderId: "cf_a", amount: 1200, note: "slot_unavailable" }, fetchImpl as unknown as typeof fetch);
    const bodies = (fetchImpl.mock.calls as unknown as [string, RequestInit][]).map(([, init]) => JSON.parse(String(init.body)));
    expect(bodies[0]).toEqual({ refund_amount: 1200, refund_id: cashfreeRefundId("cf_a"), refund_note: "slot_unavailable" });
    expect(bodies[1].refund_id).toBe(bodies[0].refund_id);
  });
});

describe("Cashfree payment alerts", () => {
  const raw = JSON.stringify({
    type: "PAYMENT_SUCCESS_WEBHOOK",
    data: { order: { order_id: "cf_a", order_amount: 1200, order_currency: "INR" }, payment: { cf_payment_id: 987, payment_status: "SUCCESS", payment_amount: 1200, payment_currency: "INR" } },
  });
  const sign = (secret: string, ts: string, body: string) => createHmac("sha256", secret).update(ts + body).digest("base64");

  it("accepts only alerts signed with the city's Cashfree secret key", async () => {
    const ts = "1763630000000";
    expect(await verifyCashfreeSignature("test_secret", ts, raw, sign("test_secret", ts, raw))).toBe(true);
    expect(await verifyCashfreeSignature("test_secret", ts, raw, sign("other_secret", ts, raw))).toBe(false);
    expect(await verifyCashfreeSignature("test_secret", ts, raw.replace("1200", "1"), sign("test_secret", ts, raw))).toBe(false);
    expect(await verifyCashfreeSignature("test_secret", "1763630000001", raw, sign("test_secret", ts, raw))).toBe(false);
  });

  it("reads the order and payment from a success alert", () => {
    const event = parseCashfreeWebhook(JSON.parse(raw));
    expect(event).toMatchObject({ orderId: "cf_a", paymentId: "987", amount: 1200 });
    expect(isCashfreeSuccess(event)).toBe(true);
    expect(isCashfreeSuccess({ ...event, type: "PAYMENT_FAILED_WEBHOOK", paymentStatus: "FAILED" })).toBe(false);
  });
});

describe("gateway credentials", () => {
  const row = { id: "g", name: "razorpay", api_key: " rzp_live_k ", api_secret: "db_secret", is_test_mode: false };

  it("keeps the per-city Razorpay secret override", () => {
    const env = (n: string) => (n === "RAZORPAY_SECRET_BENGALURU" ? "env_secret" : undefined);
    expect(credentialsFromRow(row, "Bengaluru", env)).toMatchObject({ keyId: "rzp_live_k", keySecret: "env_secret" });
    expect(credentialsFromRow(row, "Chennai", env)).toMatchObject({ keySecret: "db_secret" });
  });

  it("refuses accounts without both keys or that cannot take online payments", () => {
    expect(credentialsFromRow({ ...row, name: "cashfree", api_secret: null }, "Chennai", () => undefined)).toBeNull();
    expect(credentialsFromRow({ ...row, name: "stripe" }, "Chennai", () => undefined)).toBeNull();
    expect(credentialsFromRow({ ...row, name: "cashfree", is_test_mode: true }, "Chennai", () => undefined))
      .toMatchObject({ name: "cashfree", testMode: true });
  });

  it("explains why a gateway cannot be switched to, without exposing other errors", () => {
    expect(checkoutSwitchMessage({ message: "Save this gateway's keys first" })).toBe("Save this gateway's keys first");
    expect(checkoutSwitchMessage({ message: "permission denied for table payment_gateways" })).toBeNull();
  });
});

// Minimal stand-in for the service client: records writes and answers one RPC.
function fakeAdmin(rpcResult: { data?: unknown; error?: { message: string } | null } = { data: { already_completed: false }, error: null }) {
  const writes: { table: string; op: string; values: unknown }[] = [];
  const rpcs: { name: string; args: Record<string, unknown> }[] = [];
  return {
    writes,
    rpcs,
    from: (table: string) => ({
      update: (values: unknown) => ({ eq: async () => { writes.push({ table, op: "update", values }); return { error: null }; } }),
      insert: async (values: unknown) => { writes.push({ table, op: "insert", values }); return { error: null }; },
    }),
    rpc: async (name: string, args: Record<string, unknown>) => { rpcs.push({ name, args }); return rpcResult; },
  };
}

const guestPending = (status = "pending"): PendingCheckout => ({
  table: "pending_guest_bookings", city: "Chennai", gateway: "cashfree",
  row: { id: "p1", status, razorpay_order_id: "cf_a", city: "Chennai", amount: 1200, currency: "INR", bay_id: "b", start_time: "s", end_time: "e" },
});

describe("finishing a paid Cashfree checkout", () => {
  it("creates the guest booking recorded as a Cashfree payment", async () => {
    const admin = fakeAdmin();
    const fetchImpl = vi.fn(async () => jsonResponse({ booking: { id: "bk" } }));
    const out = await finalizePaidCheckout({ admin, supabaseUrl: "https://x", serviceKey: "svc", fetchImpl: fetchImpl as unknown as typeof fetch }, guestPending(), "987");
    expect(out).toEqual({ status: "finalized" });
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ action: "guest_booking", gateway_name: "cashfree", order_id: "cf_a", payment_id: "987", amount: 1200 });
  });

  it("does nothing for a checkout that is already finished", async () => {
    const fetchImpl = vi.fn();
    const out = await finalizePaidCheckout({ admin: fakeAdmin(), supabaseUrl: "x", serviceKey: "s", fetchImpl: fetchImpl as unknown as typeof fetch }, guestPending("completed"), "987");
    expect(out).toEqual({ status: "already_done" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("waits for the real payment id instead of recording a placeholder", async () => {
    const fetchImpl = vi.fn();
    const out = await finalizePaidCheckout({ admin: fakeAdmin(), supabaseUrl: "x", serviceKey: "s", fetchImpl: fetchImpl as unknown as typeof fetch }, guestPending(), null);
    expect(out.status).toBe("error");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("keeps the refund outcome when the slot was gone", async () => {
    const admin = fakeAdmin();
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "This slot is no longer available.", refunded: true }, 409));
    const out = await finalizePaidCheckout({ admin, supabaseUrl: "x", serviceKey: "s", fetchImpl: fetchImpl as unknown as typeof fetch }, guestPending(), "987");
    expect(out).toEqual({ status: "slot_unavailable" });
    expect(admin.writes).toEqual([]);
    expect(slotRefundRecorded(JSON.stringify({ error: "x" }))).toBe(false);
  });

  it("credits hours once and notifies only the first time", async () => {
    const pending: PendingCheckout = {
      table: "pending_purchases", city: "Chennai", gateway: "cashfree",
      row: { id: "p2", status: "pending", razorpay_order_id: "cf_b", user_id: "u", package_hours: 10, package_price: 5000, currency: "INR", city: "Chennai" },
    };
    const first = fakeAdmin({ data: { already_completed: false }, error: null });
    expect(await finalizePaidCheckout({ admin: first, supabaseUrl: "x", serviceKey: "s" }, pending, "555")).toEqual({ status: "finalized" });
    expect(first.rpcs[0]).toMatchObject({ name: "complete_hour_purchase", args: { p_order_id: "cf_b", p_payment_id: "555", p_hours: 10 } });
    expect(first.writes.filter((w) => w.table === "notifications")).toHaveLength(1);

    const repeat = fakeAdmin({ data: { already_completed: true }, error: null });
    expect(await finalizePaidCheckout({ admin: repeat, supabaseUrl: "x", serviceKey: "s" }, pending, "555")).toEqual({ status: "already_done" });
    expect(repeat.writes.filter((w) => w.table === "notifications")).toHaveLength(0);
  });
});

describe("late-payment refunds go back through the gateway that took the money", () => {
  const adminWith = (rows: Record<string, unknown>) => ({
    from: () => {
      const filters: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => { filters[k] = v; return q; },
        is: () => q,
        maybeSingle: async () => ({ data: rows[String(filters.name)] ?? null }),
      };
      return q;
    },
  });
  const rows = {
    razorpay: { id: "r", name: "razorpay", api_key: "rzp_k", api_secret: "rzp_s", is_test_mode: false },
    cashfree: { id: "c", name: "cashfree", api_key: "CF_APP", api_secret: "cf_s", is_test_mode: false },
  };

  it("refunds a Cashfree checkout through Cashfree, for the amount paid", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    const res = await refundCheckoutPayment(adminWith(rows), {
      city: "Chennai", gateway: "cashfree", orderId: "cf_a", paymentId: "987", amount: 1200, notes: { reason: "slot_unavailable" },
    });
    expect(res.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.cashfree.com/pg/orders/cf_a/refunds");
    expect(JSON.parse(String(init.body)).refund_amount).toBe(1200);
  });

  it("refunds an older Razorpay checkout through Razorpay even after the city switched", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
    await refundCheckoutPayment(adminWith(rows), {
      city: "Chennai", gateway: "razorpay", orderId: "order_1", paymentId: "pay_1", amount: 1200, notes: { reason: "slot_unavailable" },
    });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("https://api.razorpay.com/v1/payments/pay_1/refund");
  });
});
