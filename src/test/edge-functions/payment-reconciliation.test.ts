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

  it("marks pending rows as failed on payment.failed", () => {
    expect(webhookSrc).toMatch(/payment\.failed[\s\S]+pending_guest_bookings[\s\S]+failed/);
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
