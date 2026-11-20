import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pageSrc = readFileSync(
  resolve(__dirname, "../../pages/PublicBooking.tsx"),
  "utf-8",
);
const calendarSyncSrc = readFileSync(
  resolve(__dirname, "../../../supabase/functions/calendar-sync/index.ts"),
  "utf-8",
);

// Regression guards for the Mark John incident (2026-09-09): a signed-in member
// paid, the webhook finalized the booking first, and the browser — which also
// tried to create the booking — hit its own booking as a slot conflict and
// showed "Booking Failed" on a booking that was in fact confirmed.
describe("member paid booking: server finalizes, browser only waits", () => {
  it("never creates a booking from the browser once the payment window reports success", () => {
    const paidStart = pageSrc.indexOf("await payForOrder(checkoutOrder");
    const paidEnd = pageSrc.indexOf("setBookingComplete(true)", paidStart);
    expect(paidStart).toBeGreaterThan(0);
    expect(paidEnd).toBeGreaterThan(paidStart);
    const paidFlow = pageSrc.slice(paidStart, paidEnd);
    expect(paidFlow).not.toMatch(/createBooking\.mutateAsync/);
    expect(paidFlow).not.toMatch(/revenue_transactions/);
    // And it must not mark the pending row completed itself.
    expect(paidFlow).not.toMatch(/status:\s*"completed"/);
    // The shared payment window (Razorpay or Cashfree) only reports payment.
    const checkoutSrc = readFileSync(resolve(__dirname, "../../lib/online-checkout.ts"), "utf-8");
    expect(checkoutSrc).not.toMatch(/\.from\(/);
    expect(checkoutSrc).not.toMatch(/createBooking|revenue_transactions/);
  });

  it("waits on pending_bookings for members and pending_guest_bookings for guests", () => {
    expect(pageSrc).toMatch(
      /waitForPaymentFinalization\(\s*user \? "pending_bookings" : "pending_guest_bookings"/,
    );
  });

  it("treats a slow server as 'payment received', not as a booking failure", () => {
    expect(pageSrc).toMatch(/const finalizationTimedOut = result\.status === "timeout"/);
    expect(pageSrc).toMatch(/setConfirmationPending\(finalizationTimedOut\)/);
    expect(pageSrc).toMatch(/being confirmed/);
  });

  it("only reports a hard failure when the server itself reports failure", () => {
    expect(pageSrc).toMatch(
      /result\.status === "failed"[\s\S]{0,160}throw new Error\(result\.error_message/,
    );
  });

  it("aborts before taking payment if the pending row cannot be stashed", () => {
    // The order function records the pending row itself and returns an error
    // (no order id) if it cannot, so the page throws before opening checkout.
    const orderSrc = readFileSync(
      resolve(__dirname, "../../../supabase/functions/create-razorpay-order/index.ts"), "utf8");
    expect(orderSrc).toMatch(/stashErr[\s\S]{0,200}Could not start payment\. Please try again\./);
    expect(pageSrc).toMatch(/orderRes\.data\?\.error[\s\S]{0,120}throw new Error/);
  });

  it("still allows the hours-based (non-payment) member booking to be created directly", () => {
    expect(pageSrc).toMatch(/paymentMethod === "hours"[\s\S]{0,400}createBooking\.mutateAsync/);
  });
});

describe("server-side member finalization stays complete and idempotent", () => {
  it("atomically claims the pending row so double finalization is impossible", () => {
    const start = calendarSyncSrc.indexOf('action === "finalize_pending_member_booking"');
    expect(start).toBeGreaterThan(0);
    const block = calendarSyncSrc.slice(start, start + 12000);
    expect(block).toMatch(/status: "processing"[\s\S]{0,1500}already_finalized/);
  });


  it("creates booking, revenue, notification and emails server-side", () => {
    const start = calendarSyncSrc.indexOf('action === "finalize_pending_member_booking"');
    const block = calendarSyncSrc.slice(start, start + 12000);
    expect(block).toMatch(/\.from\("bookings"\)\s*\.insert/);
    expect(block).toMatch(/revenue_transactions/);
    expect(block).toMatch(/sendBookingConfirmedNotifications/);
    expect(block).toMatch(/status: "completed"/);
  });
});
