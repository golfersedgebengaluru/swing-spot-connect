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
  it("never creates a booking from the browser inside the Razorpay handler", () => {
    const handlerStart = pageSrc.indexOf("handler: async (response: any)");
    const handlerEnd = pageSrc.indexOf("prefill:", handlerStart);
    expect(handlerStart).toBeGreaterThan(0);
    expect(handlerEnd).toBeGreaterThan(handlerStart);
    const handler = pageSrc.slice(handlerStart, handlerEnd);
    expect(handler).not.toMatch(/createBooking\.mutateAsync/);
    expect(handler).not.toMatch(/revenue_transactions/);
    // And it must not mark the pending row completed itself.
    expect(handler).not.toMatch(/status:\s*"completed"/);
  });

  it("waits on pending_bookings for members and pending_guest_bookings for guests", () => {
    expect(pageSrc).toMatch(
      /waitForPaymentFinalization\(\s*user \? "pending_bookings" : "pending_guest_bookings"/,
    );
  });

  it("treats a slow server as 'payment received', not as a booking failure", () => {
    expect(pageSrc).toMatch(/if \(result\.status === "timeout"\) finalizationTimedOut = true/);
    expect(pageSrc).toMatch(/setConfirmationPending\(finalizationTimedOut\)/);
    expect(pageSrc).toMatch(/being confirmed/);
  });

  it("only reports a hard failure when the server itself reports failure", () => {
    expect(pageSrc).toMatch(
      /result\.status === "failed"[\s\S]{0,160}throw new Error\(result\.error_message/,
    );
  });

  it("aborts before taking payment if the pending row cannot be stashed", () => {
    // Both stashes are fatal now — the webhook has nothing to finalize without them.
    const matches = pageSrc.match(/Could not start payment\. Please try again\./g) ?? [];
    expect(matches.length).toBe(2);
    expect(pageSrc).not.toMatch(/stash pending .*booking \(non-fatal\)/);
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
