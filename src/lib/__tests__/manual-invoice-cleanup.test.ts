import { describe, it, expect } from "vitest";
import { voidManualInvoiceRevenue } from "@/lib/manual-invoice-cleanup";

function fakeClient(rev: Record<string, unknown> | null) {
  const updates: { table: string; values: any; filters: [string, unknown][] }[] = [];
  const client: any = {
    from(table: string) {
      const q: any = { filters: [] as [string, unknown][], values: null };
      q.select = () => q;
      q.update = (v: any) => { q.values = v; return q; };
      q.eq = (k: string, v: unknown) => { q.filters.push([k, v]); return q; };
      q.maybeSingle = async () => ({ data: rev, error: null });
      q.then = (res: any) => { updates.push({ table, values: q.values, filters: q.filters }); return Promise.resolve({ error: null }).then(res); };
      return q;
    },
  };
  return { client, updates };
}

describe("voidManualInvoiceRevenue", () => {
  it("voids a deleted manual invoice's payment and cancels the booking it created", async () => {
    const { client, updates } = fakeClient({ id: "r1", status: "confirmed", booking_id: "b1", metadata: { manual_invoice: true } });
    await voidManualInvoiceRevenue(client, "r1", "INV/1550", "invoice_deleted");
    expect(updates[0].table).toBe("revenue_transactions");
    expect(updates[0].values.status).toBe("failed");
    expect(updates[1]).toMatchObject({ table: "bookings", values: { status: "cancelled" } });
    expect(updates[1].filters).toContainEqual(["note", "Invoice INV/1550"]);
  });

  it("never voids a gateway payment", async () => {
    const { client, updates } = fakeClient({ id: "r1", status: "confirmed", booking_id: "b1", metadata: {} });
    await voidManualInvoiceRevenue(client, "r1", "INV/1", "invoice_deleted");
    expect(updates).toHaveLength(0);
  });

  it("leaves already-voided entries alone", async () => {
    const { client, updates } = fakeClient({ id: "r1", status: "failed", booking_id: null, metadata: { manual_invoice: true } });
    await voidManualInvoiceRevenue(client, "r1", "INV/1", "invoice_creation_failed");
    expect(updates).toHaveLength(0);
  });
});
