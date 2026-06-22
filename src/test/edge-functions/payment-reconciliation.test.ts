import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const webhookSrc = readFileSync(
  resolve(__dirname, "../../../supabase/functions/razorpay-webhook/index.ts"),
  "utf-8",
);
const reconcilerSrc = readFileSync(
  resolve(__dirname, "../../../supabase/functions/reconcile-pending-payments/index.ts"),
  "utf-8",
);
const adminTabSrc = readFileSync(
  resolve(__dirname, "../../components/admin/AdminPaymentsTab.tsx"),
  "utf-8",
);

describe("razorpay-webhook always returns 200 (prevents Razorpay auto-disable)", () => {
  it("does NOT return 4xx/5xx on missing signature", () => {
    // Razorpay auto-disables webhooks after repeated non-2xx responses.
    // Misconfig errors must be surfaced in logs, not via HTTP status.
    expect(webhookSrc).toMatch(/Missing signature[\s\S]{0,200}status:\s*200/);
  });
  it("does NOT return 4xx/5xx on invalid signature", () => {
    expect(webhookSrc).toMatch(/Invalid signature[\s\S]{0,200}status:\s*200/);
  });
  it("does NOT return 4xx/5xx when webhook secret is missing", () => {
    expect(webhookSrc).toMatch(/Webhook secret not configured[\s\S]{0,200}status:\s*200/);
  });
  it("logs secret_source for traceability", () => {
    expect(webhookSrc).toMatch(/secret_source=/);
  });
});

describe("razorpay-webhook signature & reconciliation wiring", () => {
  it("rejects requests without x-razorpay-signature", () => {
    expect(webhookSrc).toMatch(/x-razorpay-signature/);
    expect(webhookSrc).toMatch(/Missing signature/);
  });

  it("verifies HMAC-SHA256 using the per-city webhook_secret", () => {
    expect(webhookSrc).toMatch(/payment_gateways[\s\S]{0,400}webhook_secret/);
    expect(webhookSrc).toMatch(/HMAC.*SHA-256|SHA-256.*HMAC/);
  });

  it("uses constant-time comparison for the signature", () => {
    expect(webhookSrc).toMatch(/diff \|= computedSignature\.charCodeAt/);
  });

  it("is idempotent on payment_events.razorpay_event_id", () => {
    expect(webhookSrc).toMatch(/payment_events[\s\S]{0,200}razorpay_event_id/);
    expect(webhookSrc).toMatch(/already_processed/);
  });

  it("reconciles all three pending tables on payment.captured", () => {
    expect(webhookSrc).toMatch(/pending_guest_bookings/);
    expect(webhookSrc).toMatch(/pending_purchases/);
    expect(webhookSrc).toMatch(/pending_legacy_league_team_registrations/);
  });

  it("invokes calendar-sync with action=guest_booking when reconciling a guest booking", () => {
    expect(webhookSrc).toMatch(/calendar-sync[\s\S]{0,400}guest_booking/);
  });

  it("handles order.paid identically to payment.captured (Razorpay sends this on retry success)", () => {
    expect(webhookSrc).toMatch(/order\.paid/);
    expect(webhookSrc).toMatch(/isSuccess[\s\S]{0,200}payment\.captured[\s\S]{0,200}order\.paid|payment\.captured[\s\S]{0,200}order\.paid[\s\S]{0,200}isSuccess/);
  });

  it("does NOT mark pending_* rows failed on payment.failed (retries on same order must still finalize)", () => {
    // The cron reconciler is the only thing that may flip pending_* → failed, and
    // only after re-checking the live Razorpay order status.
    expect(webhookSrc).not.toMatch(/payment\.failed[\s\S]{0,2000}pending_guest_bookings[\s\S]{0,200}status:\s*"failed"/);
    expect(webhookSrc).toMatch(/payment\.failed[\s\S]+leaving pending_\* rows untouched/);
  });
});

describe("reconcile-pending-payments cron job", () => {
  it("queries Razorpay Orders API for pending bookings", () => {
    expect(reconcilerSrc).toMatch(/api\.razorpay\.com\/v1\/orders\//);
  });

  it("only processes rows older than a small grace period (avoids racing the browser)", () => {
    expect(reconcilerSrc).toMatch(/RECONCILE_AGE_MIN/);
  });

  it("ignores rows older than the 24h backstop", () => {
    expect(reconcilerSrc).toMatch(/MAX_AGE_HOURS\s*=\s*24/);
  });

  it("finalizes guest bookings by invoking calendar-sync with order_id and payment_id", () => {
    expect(reconcilerSrc).toMatch(/calendar-sync[\s\S]+order_id/);
    expect(reconcilerSrc).toMatch(/action:\s*"guest_booking"/);
  });

  it("finalizes hour purchases via complete_hour_purchase RPC", () => {
    expect(reconcilerSrc).toMatch(/complete_hour_purchase/);
  });

  it("inserts legacy team registration on captured payment", () => {
    expect(reconcilerSrc).toMatch(/legacy_league_team_registrations[\s\S]+insert/);
  });

  it("marks long-pending rows whose Razorpay status is not paid as failed", () => {
    expect(reconcilerSrc).toMatch(/Razorpay order status=/);
    expect(reconcilerSrc).toMatch(/status:\s*"failed"/);
  });

  it("returns a structured summary so cron logs are auditable", () => {
    expect(reconcilerSrc).toMatch(/checked/);
    expect(reconcilerSrc).toMatch(/finalized/);
    expect(reconcilerSrc).toMatch(/still_pending/);
  });
});

describe("AdminPaymentsTab webhook_secret field", () => {
  it("Gateway interface includes webhook_secret", () => {
    expect(adminTabSrc).toMatch(/webhook_secret:\s*string\s*\|\s*null/);
  });

  it("renders the Webhook Secret input only for razorpay gateways", () => {
    expect(adminTabSrc).toMatch(/gw\.name === "razorpay"[\s\S]+Webhook Secret/);
  });

  it("shows the webhook URL admins should paste into Razorpay dashboard", () => {
    expect(adminTabSrc).toMatch(/razorpay-webhook/);
    expect(adminTabSrc).toMatch(/payment\.captured/);
    expect(adminTabSrc).toMatch(/payment\.failed/);
  });
});

describe("browser is no longer load-bearing for payment finalization", () => {
  const publicBookingSrc = readFileSync(
    resolve(__dirname, "../../pages/PublicBooking.tsx"),
    "utf-8",
  );
  const dashboardSrc = readFileSync(
    resolve(__dirname, "../../pages/Dashboard.tsx"),
    "utf-8",
  );
  const pollerSrc = readFileSync(
    resolve(__dirname, "../../hooks/usePaymentFinalization.ts"),
    "utf-8",
  );

  it("guest checkout no longer calls calendar-sync from the Razorpay handler", () => {
    // The browser handler must not invoke calendar-sync; the webhook owns finalization.
    expect(publicBookingSrc).not.toMatch(/invoke\("calendar-sync",\s*\{\s*body:\s*\{\s*action:\s*"guest_booking"/);
    expect(publicBookingSrc).toMatch(/waitForPaymentFinalization\(\s*"pending_guest_bookings"/);
  });

  it("hour purchase no longer calls confirm-hour-purchase from the Razorpay handler", () => {
    expect(dashboardSrc).not.toMatch(/invoke\("confirm-hour-purchase"/);
    expect(dashboardSrc).toMatch(/waitForPaymentFinalization\(\s*"pending_purchases"/);
  });

  it("poller resolves on status='completed', surfaces 'failed', returns 'timeout' otherwise", () => {
    expect(pollerSrc).toMatch(/status === "completed"/);
    expect(pollerSrc).toMatch(/status === "failed"/);
    expect(pollerSrc).toMatch(/return \{ status: "timeout" \}/);
  });

  it("poller queries one of the three pending_* tables by razorpay_order_id", () => {
    expect(pollerSrc).toMatch(/pending_guest_bookings/);
    expect(pollerSrc).toMatch(/pending_purchases/);
    expect(pollerSrc).toMatch(/pending_legacy_league_team_registrations/);
    expect(pollerSrc).toMatch(/eq\("razorpay_order_id"/);
  });
});

describe("webhook idempotency across browser/webhook/cron race", () => {
  it("webhook only finalizes pending_* rows still in status='pending'", () => {
    // Prevents a second finalize if the cron or browser already completed it.
    expect(webhookSrc).toMatch(/pending_guest_bookings[\s\S]{0,300}status",\s*"pending"/);
    expect(webhookSrc).toMatch(/pending_purchases[\s\S]{0,300}status",\s*"pending"/);
    expect(webhookSrc).toMatch(/pending_legacy_league_team_registrations[\s\S]{0,300}status",\s*"pending"/);
  });

  it("cron reconciler also filters by status='pending' (matches webhook gate)", () => {
    expect(reconcilerSrc).toMatch(/\.eq\("status",\s*"pending"\)/);
  });
});

