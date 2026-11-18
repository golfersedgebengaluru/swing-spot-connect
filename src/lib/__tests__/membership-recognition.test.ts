import { describe, it, expect } from "vitest";
import {
  applyMembershipRecognition, deferredAt, membershipGstInRange, membershipEndDate, membershipSchedule, recognizedInRange, type MembershipTerm,
} from "@/lib/membership-recognition";

const term = (over: Partial<MembershipTerm>): MembershipTerm => ({
  id: "m1", user_id: "u1", city: "Bengaluru", product_id: "p1", revenue_transaction_id: "sale1",
  refund_transaction_id: null, invoice_line_item_id: null, sold_on: "2026-09-01", amount: 30000,
  starts_on: "2026-09-01", ends_on: "2026-11-30", status: "active", cancelled_on: null, refund_amount: null, ...over,
});

describe("membership end date", () => {
  it("ends the day before the same date three months later", () => {
    expect(membershipEndDate("2026-08-20", 3)).toBe("2026-11-19");
    expect(membershipEndDate("2026-09-01", 3)).toBe("2026-11-30");
  });
  it("ends on the last day of a shorter month", () => {
    expect(membershipEndDate("2026-11-30", 3)).toBe("2027-02-28");
    expect(membershipEndDate("2027-11-30", 3)).toBe("2028-02-29");
  });
});

describe("spreading a membership over its validity", () => {
  it("a 3-month membership starting on the 1st earns one third each month", () => {
    const s = membershipSchedule(term({}));
    expect(s.map((x) => x.amount)).toEqual([10000, 10000, 10000]);
  });

  it("prorates the first and last months and gives full months equal shares", () => {
    // 20 Aug – 19 Nov: Aug 12/31, Sep 1, Oct 1, Nov 19/30 month-units.
    const s = membershipSchedule(term({ starts_on: "2026-08-20", ends_on: "2026-11-19", amount: 25000 }));
    const units = 12 / 31 + 1 + 1 + 19 / 30;
    expect(s[1].amount).toBe(s[2].amount);
    expect(s[1].amount).toBeCloseTo(25000 / units, 1);
    expect(s[0].amount).toBeCloseTo((25000 * (12 / 31)) / units, 1);
    expect(s[3].amount).toBeCloseTo((25000 * (19 / 30)) / units, 1);
    expect(s.reduce((a, x) => a + x.amount, 0)).toBe(25000);
  });

  it("never loses or adds a paisa to rounding", () => {
    const s = membershipSchedule(term({ amount: 10000, starts_on: "2026-01-07", ends_on: "2026-04-06" }));
    expect(Math.round(s.reduce((a, x) => a + x.amount, 0) * 100)).toBe(1_000_000);
  });

  it("earns nothing before a later start date chosen by staff", () => {
    const m = term({ sold_on: "2026-09-01", starts_on: "2026-10-01", ends_on: "2026-12-31" });
    expect(recognizedInRange(m, "2026-09-01", "2026-09-30")).toBe(0);
    expect(recognizedInRange(m, "2026-10-01", "2026-10-31")).toBe(10000);
    expect(deferredAt(m, "2026-09-30")).toBe(30000);
  });

  it("shows received-but-not-earned money until the membership ends", () => {
    const m = term({});
    expect(deferredAt(m, "2026-08-31")).toBe(0);
    expect(deferredAt(m, "2026-09-30")).toBe(20000);
    expect(deferredAt(m, "2026-11-30")).toBe(0);
  });
});

describe("cancelling a membership", () => {
  it("keeps what was earned and counts the kept part in the cancellation month", () => {
    const m = term({ status: "cancelled", cancelled_on: "2026-10-15", refund_amount: 12000 });
    expect(recognizedInRange(m, "2026-09-01", "2026-09-30")).toBe(10000);
    expect(recognizedInRange(m, "2026-10-01", "2026-10-31")).toBe(8000);
    expect(recognizedInRange(m, "2026-11-01", "2026-11-30")).toBe(0);
    expect(deferredAt(m, "2026-10-31")).toBe(0);
  });

  it("a refund larger than the unearned part reduces the cancellation month", () => {
    const m = term({ status: "cancelled", cancelled_on: "2026-11-02", refund_amount: 30000 });
    expect(recognizedInRange(m, "2026-11-01", "2026-11-30")).toBe(-20000);
    expect(recognizedInRange(m, "2026-01-01", "2026-12-31")).toBe(0);
  });
});

describe("revenue rows for a period", () => {
  it("replaces an online membership sale with what it earned in the month", () => {
    const rows = [{ id: "sale1", amount: 30000, transaction_type: "payment" }, { id: "b1", amount: 1200, transaction_type: "booking" }];
    const r = applyMembershipRecognition(rows, [term({})], "2026-09-01", "2026-09-30");
    const total = r.rows.reduce((a, x) => a + Number(x.amount), 0);
    expect(total).toBe(11200);
    expect(r.deferred).toBe(20000);
  });

  it("keeps other items on the same in-person invoice", () => {
    const rows = [{ id: "sale1", amount: 32000, transaction_type: "purchase" }];
    const r = applyMembershipRecognition(rows, [term({ invoice_line_item_id: "line1" })], "2026-09-01", "2026-09-30");
    expect(r.rows.map((x) => Number(x.amount)).sort((a, b) => a - b)).toEqual([2000, 10000]);
    expect(r.membershipLineIds.has("line1")).toBe(true);
  });

  it("drops the cancellation refund row because the earned figures already net it", () => {
    const m = term({ status: "cancelled", cancelled_on: "2026-10-15", refund_amount: 12000, refund_transaction_id: "ref1" });
    const rows = [{ id: "ref1", amount: -12000, transaction_type: "refund" }];
    const r = applyMembershipRecognition(rows, [m], "2026-10-01", "2026-10-31");
    expect(r.rows.reduce((a, x) => a + Number(x.amount), 0)).toBe(8000);
  });

  it("leaves past sales without a membership record exactly as they were", () => {
    const rows = [{ id: "old", amount: 25000, transaction_type: "purchase" }];
    const r = applyMembershipRecognition(rows, [], "2026-08-01", "2026-08-31");
    expect(r.rows).toEqual(rows);
  });
});

describe("spreading the amount before GST", () => {
  const gst = (over: Partial<MembershipTerm> = {}) => term({ amount: 35400, taxable_amount: 30000, gst_amount: 5400, ...over });

  it("spreads only the value before GST", () => {
    expect(membershipSchedule(gst()).map((x) => x.amount)).toEqual([10000, 10000, 10000]);
    expect(deferredAt(gst(), "2026-09-30")).toBe(20000);
  });

  it("keeps the GST in the invoice month and out of revenue", () => {
    const rows = [{ id: "sale1", amount: 35400, transaction_type: "payment" }];
    const r = applyMembershipRecognition(rows, [gst()], "2026-09-01", "2026-09-30");
    expect(r.rows.reduce((a, x) => a + Number(x.amount), 0)).toBe(10000);
    expect(r.gst).toBe(5400);
    expect(membershipGstInRange(gst(), "2026-10-01", "2026-10-31")).toBe(0);
  });

  it("reduces revenue and GST by the refund's own split on cancellation", () => {
    const m = gst({ status: "cancelled", cancelled_on: "2026-10-15", refund_amount: 11800 });
    // Refund 11,800 = 10,000 before GST + 1,800 GST.
    expect(recognizedInRange(m, "2026-10-01", "2026-10-31")).toBe(10000);
    expect(recognizedInRange(m, "2026-01-01", "2026-12-31")).toBe(20000);
    expect(membershipGstInRange(m, "2026-10-01", "2026-10-31")).toBe(-1800);
  });
});
