// Called by the payment window as soon as Cashfree's checkout closes. Asks
// Cashfree (with the city's stored keys) whether the order is paid and, if so,
// finishes the checkout. Callers only name an order; payment proof always comes
// from Cashfree, so anyone may ask and nothing can be faked.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3";
import { fetchCashfreeOrderPayment, isCashfreeOrderId } from "../_shared/cashfree.ts";
import { finalizePaidCheckout, findPendingCheckout } from "../_shared/checkout-finalize.ts";
import { cashfreeCreds, loadGatewayCredentials } from "../_shared/gateway-credentials.ts";

const Body = z.object({ order_id: z.string().refine(isCashfreeOrderId, "Invalid order") });

// Errors are returned with 200 so the browser can read the message (project convention).
const reply = (payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Invalid request" });
  try {
    if (Number(req.headers.get("content-length") || 0) > 2_000) return reply({ error: "Invalid request" });
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return reply({ error: "Invalid request" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const pending = await findPendingCheckout(admin, parsed.data.order_id);
    if (!pending || pending.gateway !== "cashfree") return reply({ error: "Payment not found" });
    if (pending.row.status === "completed") return reply({ status: "paid" });

    const creds = await loadGatewayCredentials(admin, pending.city, "cashfree");
    if (!creds) return reply({ error: "Payment account not configured" });
    const payment = await fetchCashfreeOrderPayment(cashfreeCreds(creds), parsed.data.order_id);
    if (!payment.paid) return reply({ status: payment.status });

    const outcome = await finalizePaidCheckout({ admin, supabaseUrl, serviceKey }, pending, payment.paymentId);
    if (outcome.status === "error") console.error(`[cashfree-confirm-payment] order=${parsed.data.order_id}: ${outcome.error}`);
    // Paid either way; the page polls the checkout record for the final result.
    return reply({ status: "paid" });
  } catch (err) {
    console.error("[cashfree-confirm-payment] error:", (err as Error).message);
    return reply({ error: "Could not check the payment" });
  }
});
