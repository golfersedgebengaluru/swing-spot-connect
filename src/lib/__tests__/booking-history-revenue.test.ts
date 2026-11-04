import { describe, expect, it } from "vitest";
import { bookingRevenueTotals } from "../booking-history-revenue";

describe("booking history revenue", () => {
  it("subtracts refunds without combining currencies", () => {
    const result = bookingRevenueTotals([
      { booking_id: "a", amount: 1250, currency: "INR" },
      { booking_id: "a", amount: -250, currency: "INR" },
      { booking_id: "b", amount: 10, currency: "USD" },
    ]);
    expect(result.total).toEqual({ INR: 1000, USD: 10 });
    expect(result.byBooking.get("a")).toEqual({ INR: 1000 });
  });
});