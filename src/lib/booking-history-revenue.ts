// Revenue evidence is not a cash-payment receipt. Preserve signed amounts and currencies.
export function bookingRevenueTotals(rows: Array<{ booking_id: string | null; amount: number | string; currency: string | null }>) {
  const byBooking = new Map<string, Record<string, number>>();
  const total: Record<string, number> = {};
  for (const row of rows) {
    if (!row.booking_id) continue;
    const currency = row.currency || "Unknown";
    const amount = Number(row.amount);
    const amounts = byBooking.get(row.booking_id) ?? {};
    amounts[currency] = (amounts[currency] ?? 0) + amount;
    total[currency] = (total[currency] ?? 0) + amount;
    byBooking.set(row.booking_id, amounts);
  }
  return { byBooking, total };
}