// Shared finalizer for quick_competition entry payments.
//
// Used by qc-verify-entry-payment (browser), razorpay-webhook (backstop),
// and reconcile-pending-payments cron. All three converge here so:
//   • A browser that closes before verification still gets finalized via webhook.
//   • If the webhook is delayed, the 30-minute cron sweeps it.
//   • Concurrent finalizers serialize on the atomic claim and never duplicate
//     the player row.

type AnyClient = { from: (t: string) => any };

export interface QcFinalizeResult {
  finalized: boolean;
  alreadyPaid: boolean;
  entryId: string;
  playerId: string | null;
  error?: string;
}

export async function finalizeQcEntry(
  admin: AnyClient,
  razorpayOrderId: string,
  razorpayPaymentId: string | null,
): Promise<QcFinalizeResult | null> {
  const { data: entry } = await admin
    .from("qc_entries")
    .select("*")
    .eq("razorpay_order_id", razorpayOrderId)
    .maybeSingle();
  if (!entry) return null;

  if (entry.status === "paid" && entry.player_id) {
    return {
      finalized: false,
      alreadyPaid: true,
      entryId: entry.id,
      playerId: entry.player_id,
    };
  }

  // Atomic CAS: only one finalizer flips status non-paid → paid.
  const { data: claimed, error: claimErr } = await admin
    .from("qc_entries")
    .update({ status: "paid", razorpay_payment_id: razorpayPaymentId ?? entry.razorpay_payment_id })
    .eq("id", entry.id)
    .neq("status", "paid")
    .select()
    .maybeSingle();
  if (claimErr) {
    return { finalized: false, alreadyPaid: false, entryId: entry.id, playerId: null, error: claimErr.message };
  }
  if (!claimed) {
    const { data: winner } = await admin
      .from("qc_entries")
      .select("id, player_id")
      .eq("id", entry.id)
      .maybeSingle();
    return {
      finalized: false,
      alreadyPaid: true,
      entryId: entry.id,
      playerId: winner?.player_id ?? null,
    };
  }

  // Winner — create the player row.
  const { data: player, error: pErr } = await admin
    .from("quick_competition_players")
    .insert({ competition_id: entry.competition_id, name: entry.player_name })
    .select().single();
  if (pErr || !player) {
    // Roll back so a retry/cron can finish.
    await admin
      .from("qc_entries")
      .update({ status: entry.status, razorpay_payment_id: entry.razorpay_payment_id })
      .eq("id", entry.id);
    return { finalized: false, alreadyPaid: false, entryId: entry.id, playerId: null, error: pErr?.message ?? "player insert failed" };
  }

  await admin.from("qc_entries").update({ player_id: player.id }).eq("id", entry.id);
  await admin.from("quick_competition_audit").insert({
    competition_id: entry.competition_id,
    action: "paid_entry",
    details: { entry_id: entry.id, player_id: player.id, amount: Number(entry.amount), via: "shared-finalize" },
  });
  return { finalized: true, alreadyPaid: false, entryId: entry.id, playerId: player.id };
}
