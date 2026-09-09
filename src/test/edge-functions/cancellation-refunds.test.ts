import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Pass 3: one cancellation routine, one refund writer.
 *
 * Before this, member cancel and admin cancel each had their own copy of the
 * refund logic, both inserted a ₹0 "refund" revenue row for hours-only
 * cancellations (pure noise: 154 such rows), and the paid reversal was inserted
 * directly with a positive amount and no key, so a retry could refund twice.
 */

const FN = path.resolve(__dirname, "../../../supabase/functions");
const calendarSync = fs.readFileSync(path.join(FN, "calendar-sync/index.ts"), "utf8");
const ledger = fs.readFileSync(path.join(FN, "_shared/revenue-ledger.ts"), "utf8");

describe("shared refund writer (edge functions)", () => {
  it("exists and calls the guarded RPC", () => {
    expect(ledger).toContain("export async function recordRefund");
    expect(ledger).toContain('admin.rpc("record_refund"');
    expect(ledger).toContain("p_source_ref");
    expect(ledger).toContain("p_original_transaction_id");
  });

  it("treats a zero refund as nothing to record", () => {
    expect(ledger).toContain("if (!(input.amount > 0))");
  });

  it("requires a source reference so retries cannot double-refund", () => {
    expect(ledger).toContain("sourceRef is required");
  });
});

describe("calendar-sync cancellation", () => {
  it("never inserts a refund revenue row directly", () => {
    const directRefundInsert =
      /from\("revenue_transactions"\)\s*\.insert\(\{[\s\S]{0,200}transaction_type:\s*"refund"/;
    expect(directRefundInsert.test(calendarSync)).toBe(false);
  });

  it("records no money row for an hours-only cancellation", () => {
    expect(calendarSync).not.toMatch(/transaction_type: "refund",\s*amount: 0,/);
    expect(calendarSync).toContain("No revenue row for an hours refund");
  });

  it("routes both dispositions through recordRefund", () => {
    expect(calendarSync).toContain('import { recordRefund } from "../_shared/revenue-ledger.ts"');
    expect(calendarSync).toContain("sourceRef: `booking_cancel_refund:${booking.id}`");
    expect(calendarSync).toContain("sourceRef: `booking_cancel_credit:${booking.id}`");
  });

  it("applies the city cancellation charge only to the external refund", () => {
    expect(calendarSync).toContain("cancellation_fee_pct");
    expect(calendarSync).toContain("Math.max(0, +(paid * (1 - feePct / 100)).toFixed(2))");
  });

  it("refuses store credit for a guest sale with no account", () => {
    expect(calendarSync).toMatch(/no member account, so store credit cannot be held/);
    // and must not silently continue as it used to
    expect(calendarSync).not.toContain("skipping advance credit insert");
  });

  it("writes the credit note and the store credit together, keyed on the booking", () => {
    expect(calendarSync).toContain("cancelInvoiceAndIssueCreditNote(adminClient, paidTx, booking.id)");
    expect(calendarSync).toContain('.eq("source_type", "credit_note")');
    expect(calendarSync).toContain('.eq("source_id", booking.id)');
  });

  it("surfaces a disposition problem instead of swallowing it", () => {
    expect(calendarSync).toContain("refund_warning: adminDispositionResult.error || null");
    expect(calendarSync).toMatch(/Cancellation disposition issue for booking/);
  });

  it("uses the same routine for member and admin cancellation", () => {
    const calls = calendarSync.match(/handleCancellationDisposition\(/g) ?? [];
    // one definition + two call sites
    expect(calls.length).toBe(3);
  });
});
