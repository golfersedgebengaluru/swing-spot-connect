import { describe, it, expect, vi } from "vitest";
import { cancelPaidBooking } from "../../../supabase/functions/calendar-sync/atomic-cancellation";
describe("paid cancellation response", () => {
  it("throws transaction failures rather than returning success", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "Credit insertion failed" } });
    await expect(cancelPaidBooking({ rpc }, "booking", "actor", "advance_credit", false)).rejects.toThrow("Credit insertion failed");
  });
  it("returns the committed credit and authenticated actor to the caller", async () => {
    const result = { success: true, credit_amount: 1250, disposition: "advance_credit", hours_refunded: 0, points_clawed_back: 0 };
    const rpc = vi.fn().mockResolvedValue({ data: result, error: null });
    expect(await cancelPaidBooking({ rpc }, "booking", "actor", "advance_credit", false)).toEqual(result);
    expect(rpc).toHaveBeenCalledWith("cancel_paid_booking_atomic", { p_booking_id: "booking", p_actor: "actor", p_disposition: "advance_credit", p_admin: false });
  });
});