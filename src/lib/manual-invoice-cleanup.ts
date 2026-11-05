import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

/**
 * Voids the payment entry (and the booking it created) that belongs to a
 * manually created invoice which no longer exists — because the invoice was
 * deleted, or because creating it failed partway. Without this, every deleted
 * or failed manual invoice leaves a confirmed payment behind that inflates
 * revenue and customer spend with no invoice to back it.
 *
 * Only manual-invoice entries are touched: gateway payments are real money
 * and must never be voided by deleting a document.
 */
export async function voidManualInvoiceRevenue(
  client: Client,
  revenueId: string | null | undefined,
  invoiceNumber: string | null,
  reason: "invoice_deleted" | "invoice_creation_failed",
): Promise<void> {
  if (!revenueId) return;
  const { data: rev, error } = await client
    .from("revenue_transactions")
    .select("id, status, booking_id, metadata")
    .eq("id", revenueId)
    .maybeSingle();
  if (error) throw error;
  if (!rev || rev.status !== "confirmed") return;
  const meta = (rev.metadata ?? {}) as Record<string, unknown>;
  if (meta.manual_invoice !== true) return;

  const { error: upErr } = await client
    .from("revenue_transactions")
    .update({
      status: "failed",
      metadata: { ...meta, voided_reason: reason, voided_invoice_number: invoiceNumber, voided_at: new Date().toISOString() },
    })
    .eq("id", revenueId);
  if (upErr) throw upErr;

  // The booking was created by this invoice only when its note names it.
  if (rev.booking_id && invoiceNumber) {
    const { error: bkErr } = await client
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("id", rev.booking_id)
      .eq("note", `Invoice ${invoiceNumber}`);
    if (bkErr) throw bkErr;
  }
}
