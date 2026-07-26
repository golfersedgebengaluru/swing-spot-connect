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
const useBookingsSrc = readFileSync(
  resolve(__dirname, "../../hooks/useBookings.ts"),
  "utf-8",
);

describe("razorpay-webhook member-booking reconciliation nesting fix", () => {
  // Regression guard for the Ojas Jani incident (2026-07-26): the pending_bookings
  // reconciliation block was accidentally nested inside the "payment id missing"
  // branch, so normal payment.captured events skipped member finalization.
  it("looks up pending_bookings unconditionally on every success event", () => {
    // The payment-id-missing lookup block must fully close BEFORE the
    // pending_bookings reconciliation begins.
    const paymentIdBranch = webhookSrc.indexOf("if (!razorpayPaymentId");
    const pendingLookup = webhookSrc.indexOf('.from("pending_bookings")');
    expect(paymentIdBranch).toBeGreaterThan(0);
    expect(pendingLookup).toBeGreaterThan(paymentIdBranch);
    // Between the two, there must be a closing brace at column 4 (end of the branch).
    const between = webhookSrc.slice(paymentIdBranch, pendingLookup);
    expect(between).toMatch(/\n {4}}\n/);
  });


  it("has an explicit comment documenting the nesting fix (prevents regressions)", () => {
    expect(webhookSrc).toMatch(/MUST run for every successful payment[\s\S]{0,400}nested/);
  });

  it("finalizes via calendar-sync's finalize_pending_member_booking action", () => {
    expect(webhookSrc).toMatch(/finalize_pending_member_booking/);
  });
});

describe("reconcile-pending-payments member-booking fallback", () => {
  it("checks pending_bookings using RECOVERABLE_STATUSES", () => {
    expect(reconcilerSrc).toMatch(/pending_bookings[\s\S]{0,300}RECOVERABLE_STATUSES/);
  });

  it("falls back to payment_events when the live Razorpay lookup fails (rotated keys, 401, etc.)", () => {
    // payment_events rows are only written after HMAC verification, so a captured
    // event there is authoritative proof of payment even when Razorpay creds fail.
    expect(reconcilerSrc).toMatch(/payment_events[\s\S]{0,400}payment\.captured[\s\S]{0,200}order\.paid/);
    expect(reconcilerSrc).toMatch(/capturedPaymentId/);
  });

  it("invokes calendar-sync with the payment id from the fallback path", () => {
    expect(reconcilerSrc).toMatch(/payment_id:\s*capturedPaymentId\s*\?\?\s*"cron_reconciled"/);
  });
});

describe("useAvailableSlots auto-refresh", () => {
  it("defaults to a 30s refetch interval so late manual calendar blocks disappear from the UI", () => {
    expect(useBookingsSrc).toMatch(/refetchInterval === undefined \? 30000/);
  });
  it("refetches on window focus", () => {
    expect(useBookingsSrc).toMatch(/refetchOnWindowFocus:\s*true/);
  });
  it("allows callers to opt out (admin dialogs) by passing refetchInterval: false", () => {
    expect(useBookingsSrc).toMatch(/refetchInterval\?:\s*number \| false/);
  });
});
