import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Behavioural tests for the "browser only waits, server finalizes" contract.
const maybeSingle = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle }),
      }),
    }),
  },
}));

const { waitForPaymentFinalization } = await import("@/hooks/usePaymentFinalization");

describe("waitForPaymentFinalization", () => {
  beforeEach(() => {
    maybeSingle.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns completed when the server already finalized before the browser polled (webhook-first race)", async () => {
    maybeSingle.mockResolvedValue({ data: { status: "completed", error_message: null } });
    const p = waitForPaymentFinalization("pending_bookings", "order_webhook_first");
    await vi.runAllTimersAsync();
    expect(await p).toEqual({ status: "completed" });
    // Resolved on the very first poll — no wasted waiting.
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("returns completed when the server finalizes a few polls later (browser-first race)", async () => {
    maybeSingle
      .mockResolvedValueOnce({ data: { status: "pending", error_message: null } })
      .mockResolvedValueOnce({ data: { status: "pending", error_message: null } })
      .mockResolvedValue({ data: { status: "completed", error_message: null } });
    const p = waitForPaymentFinalization("pending_bookings", "order_browser_first");
    await vi.runAllTimersAsync();
    expect(await p).toEqual({ status: "completed" });
    expect(maybeSingle).toHaveBeenCalledTimes(3);
  });

  it("surfaces a real server-side failure with its message", async () => {
    maybeSingle.mockResolvedValue({
      data: { status: "failed", error_message: "slot no longer available" },
    });
    const p = waitForPaymentFinalization("pending_bookings", "order_conflict");
    await vi.runAllTimersAsync();
    expect(await p).toEqual({
      status: "failed",
      error_message: "slot no longer available",
    });
  });

  it("returns timeout (never a failure) when the server is slow", async () => {
    maybeSingle.mockResolvedValue({ data: { status: "pending", error_message: null } });
    const p = waitForPaymentFinalization("pending_bookings", "order_slow", {
      intervalMs: 10,
      timeoutMs: 40,
    });
    await vi.runAllTimersAsync();
    const res = await p;
    expect(res.status).toBe("timeout");
    expect(res.status).not.toBe("failed");
  });

  it("returns timeout rather than failing when the pending row is not visible yet", async () => {
    maybeSingle.mockResolvedValue({ data: null });
    const p = waitForPaymentFinalization("pending_guest_bookings", "order_missing", {
      intervalMs: 10,
      timeoutMs: 30,
    });
    await vi.runAllTimersAsync();
    expect((await p).status).toBe("timeout");
  });
});
