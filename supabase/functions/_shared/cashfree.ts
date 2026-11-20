// Cashfree Payment Gateway (API version 2023-08-01). Pure helpers plus thin
// HTTP wrappers that take `fetchImpl`, so everything can be tested from Vitest.
// Never log request bodies or credentials from here.

export const CASHFREE_API_VERSION = "2023-08-01";

export interface CashfreeCredentials {
  appId: string;
  secretKey: string;
  testMode: boolean;
}

type FetchImpl = typeof fetch;

export const cashfreeBaseUrl = (testMode: boolean) =>
  testMode ? "https://sandbox.cashfree.com/pg" : "https://api.cashfree.com/pg";

const cashfreeHeaders = (c: CashfreeCredentials) => ({
  "Content-Type": "application/json",
  "x-api-version": CASHFREE_API_VERSION,
  "x-client-id": c.appId,
  "x-client-secret": c.secretKey,
});

/** Our own order ids: `cf_` + 32 hex characters (Cashfree allows 3–45 of [A-Za-z0-9_-]). */
export function newCashfreeOrderId(uuid: string = crypto.randomUUID()): string {
  return `cf_${uuid.replace(/-/g, "").toLowerCase()}`;
}

export const isCashfreeOrderId = (id: unknown): id is string =>
  typeof id === "string" && /^cf_[0-9a-f]{32}$/.test(id);

/** Cashfree requires a customer phone. Indian numbers become 10 digits; others keep a leading "+". */
export function cashfreeCustomerPhone(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  const digits = text.replace(/\D/g, "");
  if (digits.length === 10 && !text.startsWith("+")) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  if (text.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

/** Stable customer id: the member's account, or the guest's phone. */
export function cashfreeCustomerId(userId: string | null, phone: string): string {
  return userId ? `u_${userId.replace(/-/g, "")}` : `g_${phone.replace(/\D/g, "")}`;
}

export interface CashfreeOrderInput {
  orderId: string;
  amount: number;
  currency: string;
  customer: { id: string; phone: string; name?: string | null; email?: string | null };
  note: string;
  tags: Record<string, string>;
  notifyUrl: string;
  returnUrl?: string;
  expiresAt: string;
}

export function cashfreeOrderBody(input: CashfreeOrderInput) {
  return {
    order_id: input.orderId,
    order_amount: Math.round(input.amount * 100) / 100,
    order_currency: input.currency,
    customer_details: {
      customer_id: input.customer.id,
      customer_phone: input.customer.phone,
      ...(input.customer.name ? { customer_name: input.customer.name.slice(0, 100) } : {}),
      ...(input.customer.email ? { customer_email: input.customer.email } : {}),
    },
    order_meta: {
      notify_url: input.notifyUrl,
      ...(input.returnUrl ? { return_url: input.returnUrl } : {}),
    },
    order_note: input.note.slice(0, 200),
    order_tags: input.tags,
    order_expiry_time: input.expiresAt,
  };
}

export async function createCashfreeOrder(
  creds: CashfreeCredentials,
  input: CashfreeOrderInput,
  fetchImpl: FetchImpl = fetch,
): Promise<{ ok: true; paymentSessionId: string } | { ok: false; status: number }> {
  const res = await fetchImpl(`${cashfreeBaseUrl(creds.testMode)}/orders`, {
    method: "POST",
    headers: cashfreeHeaders(creds),
    body: JSON.stringify(cashfreeOrderBody(input)),
  });
  if (!res.ok) {
    await res.text();
    return { ok: false, status: res.status };
  }
  const body = await res.json() as { payment_session_id?: string };
  if (!body.payment_session_id) return { ok: false, status: 502 };
  return { ok: true, paymentSessionId: body.payment_session_id };
}

export interface CashfreeOrderPayment {
  /** Lower-case Cashfree order status: active, paid, expired, terminated, ... */
  status: string;
  paid: boolean;
  paymentId: string | null;
  error?: string;
}

/** Ask Cashfree whether the order was paid and, if so, which payment paid it. */
export async function fetchCashfreeOrderPayment(
  creds: CashfreeCredentials,
  orderId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<CashfreeOrderPayment> {
  const base = `${cashfreeBaseUrl(creds.testMode)}/orders/${encodeURIComponent(orderId)}`;
  const orderRes = await fetchImpl(base, { headers: cashfreeHeaders(creds) });
  if (!orderRes.ok) {
    await orderRes.text();
    return { status: "unknown", paid: false, paymentId: null, error: `order fetch ${orderRes.status}` };
  }
  const order = await orderRes.json() as { order_status?: string };
  const status = String(order.order_status ?? "unknown").toLowerCase();
  if (status !== "paid") return { status, paid: false, paymentId: null };

  const paymentsRes = await fetchImpl(`${base}/payments`, { headers: cashfreeHeaders(creds) });
  if (!paymentsRes.ok) {
    await paymentsRes.text();
    return { status, paid: true, paymentId: null, error: `payments fetch ${paymentsRes.status}` };
  }
  const payments = await paymentsRes.json() as Array<{ cf_payment_id?: string | number; payment_status?: string }>;
  const success = Array.isArray(payments) ? payments.find((p) => p.payment_status === "SUCCESS") : undefined;
  return { status, paid: true, paymentId: success?.cf_payment_id != null ? String(success.cf_payment_id) : null };
}

/** Refund a paid order in full. The refund id is derived from the order, so a retry can never refund twice. */
export async function refundCashfreeOrder(
  creds: CashfreeCredentials,
  opts: { orderId: string; amount: number; note: string },
  fetchImpl: FetchImpl = fetch,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetchImpl(`${cashfreeBaseUrl(creds.testMode)}/orders/${encodeURIComponent(opts.orderId)}/refunds`, {
    method: "POST",
    headers: cashfreeHeaders(creds),
    body: JSON.stringify({
      refund_amount: Math.round(opts.amount * 100) / 100,
      refund_id: cashfreeRefundId(opts.orderId),
      refund_note: opts.note.slice(0, 100),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, error: `Refund failed (HTTP ${res.status}): ${body.slice(0, 200)}` };
  }
  return { ok: true };
}

export const cashfreeRefundId = (orderId: string) => `rf_${orderId}`.slice(0, 40);

function base64(bytes: ArrayBuffer): string {
  let binary = "";
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Cashfree signs `timestamp + rawBody` with the account's secret key (HMAC-SHA256, base64). */
export async function verifyCashfreeSignature(
  secretKey: string,
  timestamp: string,
  rawBody: string,
  signature: string,
): Promise<boolean> {
  if (!secretKey || !timestamp || !signature) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secretKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = base64(await crypto.subtle.sign("HMAC", key, encoder.encode(timestamp + rawBody)));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

export interface CashfreeWebhookEvent {
  type: string;
  orderId: string | null;
  paymentId: string | null;
  paymentStatus: string | null;
  amount: number | null;
  currency: string | null;
}

export function parseCashfreeWebhook(payload: unknown): CashfreeWebhookEvent {
  // deno-lint-ignore no-explicit-any
  const p = (payload ?? {}) as any;
  const order = p.data?.order ?? {};
  const payment = p.data?.payment ?? {};
  const amount = Number(payment.payment_amount ?? order.order_amount);
  return {
    type: String(p.type ?? "unknown"),
    orderId: typeof order.order_id === "string" ? order.order_id : null,
    paymentId: payment.cf_payment_id != null ? String(payment.cf_payment_id) : null,
    paymentStatus: typeof payment.payment_status === "string" ? payment.payment_status : null,
    amount: Number.isFinite(amount) ? amount : null,
    currency: payment.payment_currency ?? order.order_currency ?? null,
  };
}

export const isCashfreeSuccess = (e: CashfreeWebhookEvent) =>
  e.type === "PAYMENT_SUCCESS_WEBHOOK" && e.paymentStatus === "SUCCESS";
