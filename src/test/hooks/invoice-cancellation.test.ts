import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Pass 3: cancelling an invoice must reverse the money too.
 *
 * A cancelled invoice used to leave its revenue row untouched, so the month
 * still counted income for a sale that no longer existed. And "park as store
 * credit" silently did nothing when the sale had no member account — the
 * customer's money simply disappeared from the books.
 */

const SRC = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.resolve(SRC, rel), "utf8");

const invoices = read("hooks/useInvoices.ts");
const dialog = read("components/CancellationDispositionDialog.tsx");

describe("useCancelInvoice", () => {
  it("reverses the linked revenue through the shared refund writer", () => {
    expect(invoices).toContain('import { recordRefund, recordRevenue } from "@/lib/revenue"');
    expect(invoices).toContain("sourceRef: `invoice_cancel:${invoiceId}`");
    expect(invoices).toContain("originalTransactionId: original.revenue_transaction_id");
  });

  it("dates the reversal to the credit note, not to today", () => {
    expect(invoices).toContain("revenueDate: creditNote.invoice_date");
  });

  it("refuses store credit when the sale has no member account", () => {
    expect(invoices).toMatch(/no member account, so the amount cannot be held as store credit/);
    // Guard runs BEFORE the invoice is marked cancelled.
    const guardAt = invoices.indexOf("cannot be held as store credit");
    const cancelAt = invoices.indexOf('.update({ status: "cancelled" })');
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(cancelAt);
  });

  it("no longer skips the store credit silently", () => {
    expect(invoices).not.toContain(
      'if (disposition === "advance_credit" && original.customer_user_id && original.city)',
    );
    expect(invoices).toContain("if (advErr) throw advErr;");
  });

  it("refreshes the revenue reports afterwards", () => {
    const onSuccess = invoices.slice(invoices.indexOf("sourceRef: `invoice_cancel:"));
    expect(onSuccess).toContain('queryKey: ["revenue_summary"]');
    expect(onSuccess).toContain('queryKey: ["revenue_for_pl"]');
  });
});

describe("cancellation dialog", () => {
  it("knows whether the sale has an account behind it", () => {
    expect(dialog).toContain('.select("amount, currency, user_id")');
    expect(dialog).toContain("hasAccount: !!rev?.user_id");
  });

  it("disables store credit for a walk-in/guest sale and explains why", () => {
    expect(dialog).toContain("disabled={!canHoldCredit}");
    expect(dialog).toMatch(/walk-in\/guest sale with no member account/);
  });

  it("preselects the external refund for a guest sale", () => {
    expect(dialog).toContain('if (open && isPaid && !canHoldCredit) setChoice("external_refund")');
  });
});
