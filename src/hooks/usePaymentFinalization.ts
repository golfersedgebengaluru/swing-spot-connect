import { supabase } from "@/integrations/supabase/client";

type PendingTable =
  | "pending_guest_bookings"
  | "pending_purchases"
  | "pending_legacy_league_team_registrations";

export interface FinalizationResult {
  status: "completed" | "failed" | "timeout";
  error_message?: string | null;
}

/**
 * Poll a `pending_*` row by `razorpay_order_id` until it is finalized by the
 * authoritative server path (Razorpay webhook → calendar-sync / RPC, or the
 * cron backstop). The browser never finalizes — it only waits.
 *
 * Default: poll every 2s for up to 30s.
 */
export async function waitForPaymentFinalization(
  table: PendingTable,
  razorpayOrderId: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<FinalizationResult> {
  const intervalMs = opts.intervalMs ?? 2000;
  const timeoutMs = opts.timeoutMs ?? 30000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { data } = await supabase
      .from(table)
      .select("status, error_message")
      .eq("razorpay_order_id", razorpayOrderId)
      .maybeSingle();

    if (data?.status === "completed") return { status: "completed" };
    if (data?.status === "failed") {
      return { status: "failed", error_message: data.error_message };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { status: "timeout" };
}
