import { afterEach, describe, expect, it, vi } from "vitest";
import { submitEmailAttempt } from "../../../supabase/functions/_shared/email-delivery";
import { defaultEmailSender, sendBookingConfirmedNotifications } from "../../../supabase/functions/_shared/booking-notifications";

afterEach(() => vi.unstubAllGlobals());
describe("email failure reporting", () => {
  it.each(["transport", "json", "provider"])("persists a failed attempt for %s failures without retry", async (kind) => {
    const persist = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn(async () => {
      if (kind === "transport") throw new Error("connection lost");
      if (kind === "json") return new Response("not json");
      return new Response(JSON.stringify({ error: "rejected" }), { status: 422 });
    });
    await expect(submitEmailAttempt(send, persist)).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith("failed", expect.any(String));
  });
  it("does not retry an accepted email when logging fails", async () => {
    const send = vi.fn(async () => new Response(JSON.stringify({ id: "receipt-1" })));
    const persist = vi.fn().mockRejectedValue(new Error("logging unavailable"));
    await expect(submitEmailAttempt(send, persist)).resolves.toBe("receipt-1");
    expect(send).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith("sent", "receipt-1");
  });
  it.each([500, 200])("never reports HTTP %i failure as successful member mail; admin notifications continue", async (status) => {
    vi.stubGlobal("Deno", { env: { get: () => "test" } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "provider unavailable" }), { status })));
    const adminEmail = vi.fn().mockResolvedValue(undefined);
    const result = await sendBookingConfirmedNotifications({}, {
      userId: "u", city: "Bengaluru", bayLabel: "Bay 1", isCoaching: false,
      dateLabel: "Sunday", timeLabel: "12:00", dateTimeLabel: "Sunday 12:00", duration: "1h", hoursRemaining: "1",
    }, { resolveDisplayName: async () => "Member", getAdminIds: async () => ["a"], notifyAdminsInApp: async () => {}, notifyAdminsByEmail: adminEmail });
    expect(result.memberEmailSent).toBe(false);
    expect(result.adminsNotified).toBe(true);
    expect(adminEmail).toHaveBeenCalledTimes(1);
  });
  it("accepts confirmed successful submissions", async () => {
    vi.stubGlobal("Deno", { env: { get: () => "test" } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, status: "sent" }))));
    await expect(defaultEmailSender({ user_id: "u", template: "booking_confirmed", subject: "Booking", data: {} })).resolves.toBeUndefined();
  });
});