type Disposition = "advance_credit" | "external_refund" | "hours";
export interface PaidCancellationResult {
  success: boolean;
  already_cancelled?: boolean;
  disposition: Disposition;
  credit_amount: number;
  points_clawed_back: number;
  hours_refunded: number;
}

interface CancellationClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: PaidCancellationResult | null;
    error: { message: string } | null;
  }>;
}

// NULL means no eligible gateway sale: preserve the existing hours/manual flow.
// The service-only operation validates the authenticated actor again under lock.
export async function cancelPaidBooking(
  client: CancellationClient, bookingId: string, actor: string,
  disposition: Disposition, admin: boolean,
): Promise<PaidCancellationResult | null> {
  const { data, error } = await client.rpc("cancel_paid_booking_atomic", {
    p_booking_id: bookingId, p_actor: actor, p_disposition: disposition, p_admin: admin,
  });
  if (error) throw new Error(error.message);
  return data;
}