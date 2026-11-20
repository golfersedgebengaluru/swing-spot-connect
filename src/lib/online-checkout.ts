import { supabase } from "@/integrations/supabase/client";

/** What create-razorpay-order returns: the city's chosen gateway decides the shape. */
export interface CheckoutOrder {
  gateway?: "razorpay" | "cashfree";
  order_id: string;
  // Razorpay
  key_id?: string;
  amount?: number;
  currency?: string;
  // Cashfree
  payment_session_id?: string;
  mode?: "sandbox" | "production";
  hold_minutes?: number;
}

export interface CheckoutDisplay {
  description: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
}

export const PAYMENT_CANCELLED = "Payment cancelled";

function loadScript(id: string, src: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (document.getElementById(id)) { resolve(true); return; }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/**
 * Open the payment window for an order and resolve once the customer has paid.
 * Rejects with PAYMENT_CANCELLED when they close it, or with the failure reason.
 * Payment is only ever confirmed on the server; callers then wait for the
 * pending checkout record to be finalized.
 */
export async function payForOrder(order: CheckoutOrder, display: CheckoutDisplay): Promise<void> {
  if (order.gateway === "cashfree") return payWithCashfree(order);
  return payWithRazorpay(order, display);
}

async function payWithRazorpay(order: CheckoutOrder, display: CheckoutDisplay): Promise<void> {
  if (!(await loadScript("razorpay-script", "https://checkout.razorpay.com/v1/checkout.js"))) {
    throw new Error("Failed to load payment gateway. Please try again.");
  }
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => { if (!settled) { settled = true; fn(); } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rzp = new (window as any).Razorpay({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency || "INR",
      name: "Golfer's Edge",
      description: display.description,
      order_id: order.order_id,
      // The slot is held only while the payment window is open.
      ...(order.hold_minutes ? { timeout: Number(order.hold_minutes) * 60 } : {}),
      ...(display.notes ? { notes: display.notes } : {}),
      handler: () => finish(resolve),
      prefill: display.prefill ?? {},
      theme: { color: "#16a34a" },
      modal: { ondismiss: () => finish(() => reject(new Error(PAYMENT_CANCELLED))) },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rzp.on("payment.failed", (response: any) => {
      finish(() => reject(new Error(response?.error?.description || "Payment failed")));
    });
    rzp.open();
  });
}

async function confirmCashfree(orderId: string): Promise<boolean> {
  const { data } = await supabase.functions.invoke("cashfree-confirm-payment", { body: { order_id: orderId } });
  return data?.status === "paid";
}

async function payWithCashfree(order: CheckoutOrder): Promise<void> {
  if (!order.payment_session_id) throw new Error("Failed to start payment. Please try again.");
  if (!(await loadScript("cashfree-script", "https://sdk.cashfree.com/js/v3/cashfree.js"))) {
    throw new Error("Failed to load payment gateway. Please try again.");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cashfree = (window as any).Cashfree({ mode: order.mode === "sandbox" ? "sandbox" : "production" });
  const result: { error?: { message?: string }; paymentDetails?: unknown } =
    (await cashfree.checkout({ paymentSessionId: order.payment_session_id, redirectTarget: "_modal" })) ?? {};

  // Ask the server to check with Cashfree straight away, so the booking does not wait for the alert.
  const paid = await confirmCashfree(order.order_id).catch(() => false);
  if (paid || result.paymentDetails) return;
  const message = result.error?.message || "";
  throw new Error(!message || /clos|cancel|drop/i.test(message) ? PAYMENT_CANCELLED : message);
}
