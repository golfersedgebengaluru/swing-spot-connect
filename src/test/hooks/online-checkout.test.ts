import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));

const { payForOrder, PAYMENT_CANCELLED } = await import("@/lib/online-checkout");

type CheckoutResult = { error?: { message?: string }; paymentDetails?: unknown };
const cashfreeOrder = { gateway: "cashfree" as const, order_id: "cf_0123456789abcdef0123456789abcdef", payment_session_id: "session_1", mode: "sandbox" as const };

function installCashfree(result: CheckoutResult) {
  const checkout = vi.fn(async () => result);
  const factory = vi.fn(() => ({ checkout }));
  (window as unknown as { Cashfree: unknown }).Cashfree = factory;
  // The SDK script tag is already "loaded".
  if (!document.getElementById("cashfree-script")) {
    const tag = document.createElement("script");
    tag.id = "cashfree-script";
    document.body.appendChild(tag);
  }
  return { checkout, factory };
}

describe("paying through Cashfree", () => {
  beforeEach(() => invoke.mockReset());

  it("opens Cashfree's window in the account's mode and asks the server to confirm the order", async () => {
    const { checkout, factory } = installCashfree({ paymentDetails: { paymentMessage: "ok" } });
    invoke.mockResolvedValue({ data: { status: "paid" } });
    await expect(payForOrder(cashfreeOrder, { description: "Bay #1" })).resolves.toBeUndefined();
    expect(factory).toHaveBeenCalledWith({ mode: "sandbox" });
    expect(checkout).toHaveBeenCalledWith({ paymentSessionId: "session_1", redirectTarget: "_modal" });
    expect(invoke).toHaveBeenCalledWith("cashfree-confirm-payment", { body: { order_id: cashfreeOrder.order_id } });
  });

  it("treats a closed window with no payment as cancelled", async () => {
    installCashfree({ error: { message: "User closed the popup" } });
    invoke.mockResolvedValue({ data: { status: "active" } });
    await expect(payForOrder(cashfreeOrder, { description: "Bay #1" })).rejects.toThrow(PAYMENT_CANCELLED);
  });

  it("still succeeds when the window reports an error but Cashfree has the payment", async () => {
    installCashfree({ error: { message: "Something went wrong" } });
    invoke.mockResolvedValue({ data: { status: "paid" } });
    await expect(payForOrder(cashfreeOrder, { description: "Bay #1" })).resolves.toBeUndefined();
  });

  it("shows Cashfree's reason when a payment fails", async () => {
    installCashfree({ error: { message: "Card declined by bank" } });
    invoke.mockResolvedValue({ data: { status: "active" } });
    await expect(payForOrder(cashfreeOrder, { description: "Bay #1" })).rejects.toThrow("Card declined by bank");
  });
});
