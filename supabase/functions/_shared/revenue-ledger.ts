// Single writer for the revenue ledger.
//
// Why this exists: revenue used to be inserted ad-hoc by each finalizer, and
// some paths (league registrations, competition entries, shop orders) never
// inserted anything at all. Every new capture path MUST go through
// `recordRevenue` so that:
//
//   • Idempotency is guaranteed by `source_ref` (unique index). A replayed
//     Razorpay webhook or a cron retry can never double-count.
//   • Category comes from the catalogue: `revenue_transactions.product_id` is
//     resolved by the `resolve_revenue_product` DB trigger when we don't pass
//     one explicitly. There is deliberately no `revenue_category` column —
//     categories live only in General Settings (`product_categories`).
//   • Failures never break payment finalization; they are logged and reported.

type AnyClient = { from: (t: string) => any };

export interface RecordRevenueInput {
  /** Stable, unique key for this revenue event, e.g. `league_reg:<id>`. */
  sourceRef: string;
  transactionType:
    | "payment"
    | "guest_booking"
    | "booking"
    | "purchase"
    | "product_order"
    | "league_registration"
    | "qc_entry";
  amount: number;
  currency?: string;
  city?: string | null;
  description: string;
  userId?: string | null;
  guestName?: string | null;
  guestEmail?: string | null;
  guestPhone?: string | null;
  bookingId?: string | null;
  productId?: string | null;
  gatewayName?: string | null;
  gatewayOrderRef?: string | null;
  gatewayPaymentRef?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RecordRevenueResult {
  recorded: boolean;
  /** true when a row for this sourceRef already existed (no double-count). */
  duplicate: boolean;
  revenueId: string | null;
  error?: string;
}

const DUPLICATE_CODE = "23505";

export async function recordRevenue(
  admin: AnyClient,
  input: RecordRevenueInput,
): Promise<RecordRevenueResult> {
  if (!input.sourceRef) {
    return { recorded: false, duplicate: false, revenueId: null, error: "sourceRef is required" };
  }
  if (!(input.amount > 0)) {
    // Zero/negative amounts are not revenue (free entries, fully-discounted rows).
    return { recorded: false, duplicate: false, revenueId: null };
  }

  const { data: existing } = await admin
    .from("revenue_transactions")
    .select("id")
    .eq("source_ref", input.sourceRef)
    .maybeSingle();
  if (existing?.id) {
    return { recorded: false, duplicate: true, revenueId: existing.id };
  }

  const { data, error } = await admin
    .from("revenue_transactions")
    .insert({
      source_ref: input.sourceRef,
      transaction_type: input.transactionType,
      amount: input.amount,
      currency: input.currency ?? "INR",
      city: input.city ?? null,
      description: input.description,
      status: "confirmed",
      user_id: input.userId ?? null,
      guest_name: input.guestName ?? null,
      guest_email: input.guestEmail ?? null,
      guest_phone: input.guestPhone ?? null,
      booking_id: input.bookingId ?? null,
      product_id: input.productId ?? null,
      gateway_name: input.gatewayName ?? null,
      gateway_order_ref: input.gatewayOrderRef ?? null,
      gateway_payment_ref: input.gatewayPaymentRef ?? null,
      metadata: input.metadata ?? {},
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if ((error as { code?: string }).code === DUPLICATE_CODE) {
      const { data: winner } = await admin
        .from("revenue_transactions")
        .select("id")
        .eq("source_ref", input.sourceRef)
        .maybeSingle();
      return { recorded: false, duplicate: true, revenueId: winner?.id ?? null };
    }
    console.error(`[revenue-ledger] insert failed source_ref=${input.sourceRef}: ${error.message}`);
    return { recorded: false, duplicate: false, revenueId: null, error: error.message };
  }

  return { recorded: true, duplicate: false, revenueId: data?.id ?? null };
}
