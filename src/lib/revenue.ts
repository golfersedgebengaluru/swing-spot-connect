import { supabase } from "@/integrations/supabase/client";

/**
 * The only way the app records a sale.
 *
 * Revenue used to be inserted straight into the ledger from many screens, which
 * is how shop orders were always priced in rupees, how offline hour purchases
 * were recorded as zero and how rows ended up with no city. The database now
 * refuses direct inserts from the browser; everything goes through
 * `record_revenue`, which validates the caller, de-duplicates on `sourceRef`
 * and fills in the city's currency and the business date.
 */
export interface RecordRevenueParams {
  /** Stable unique key for this sale, e.g. `shop_order:<id>`. Replays are ignored. */
  sourceRef: string;
  transactionType:
    | "payment"
    | "booking"
    | "guest_booking"
    | "purchase"
    | "product_order"
    | "league_registration"
    | "qc_entry";
  amount: number;
  description: string;
  city?: string | null;
  /** Omit to inherit the city's currency. */
  currency?: string | null;
  userId?: string | null;
  bookingId?: string | null;
  productId?: string | null;
  hoursTransactionId?: string | null;
  /** Payment method / gateway, e.g. "cash", "razorpay". */
  gatewayName?: string | null;
  /** Business date (yyyy-MM-dd). Pass the invoice date for back-dated documents. */
  revenueDate?: string | null;
  guestName?: string | null;
  guestEmail?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Records a sale. Returns the revenue id, or null when there is nothing to
 * record (a zero-amount, complimentary entry).
 */
export async function recordRevenue(params: RecordRevenueParams): Promise<string | null> {
  const { data, error } = await supabase.rpc("record_revenue", {
    p_source_ref: params.sourceRef,
    p_transaction_type: params.transactionType,
    p_amount: params.amount,
    p_description: params.description,
    p_city: params.city ?? null,
    p_currency: params.currency ?? null,
    p_user_id: params.userId ?? null,
    p_booking_id: params.bookingId ?? null,
    p_product_id: params.productId ?? null,
    p_hours_transaction_id: params.hoursTransactionId ?? null,
    p_gateway_name: params.gatewayName ?? null,
    p_revenue_date: params.revenueDate ?? null,
    p_guest_name: params.guestName ?? null,
    p_guest_email: params.guestEmail ?? null,
    p_metadata: (params.metadata ?? {}) as never,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}
