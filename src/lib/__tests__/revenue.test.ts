import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: any[]) => rpc(...a) } }));

import { recordRevenue } from "@/lib/revenue";

describe("recordRevenue", () => {
  beforeEach(() => rpc.mockReset());

  it("sends the sale to the single ledger entry point", async () => {
    rpc.mockResolvedValue({ data: "rev-1", error: null });
    const id = await recordRevenue({
      sourceRef: "shop_order:o1",
      transactionType: "product_order",
      amount: 1200,
      description: "Shop order: 1× Cap",
      city: "Chennai",
      userId: "u1",
    });
    expect(id).toBe("rev-1");
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe("record_revenue");
    expect(args).toMatchObject({
      p_source_ref: "shop_order:o1",
      p_transaction_type: "product_order",
      p_amount: 1200,
      p_city: "Chennai",
      p_user_id: "u1",
    });
  });

  it("leaves currency to the city instead of assuming rupees", async () => {
    rpc.mockResolvedValue({ data: "rev-2", error: null });
    await recordRevenue({
      sourceRef: "x:1",
      transactionType: "purchase",
      amount: 10,
      description: "d",
      city: "Dubai",
    });
    expect(rpc.mock.calls[0][1].p_currency).toBeNull();
  });

  it("passes the invoice date for back-dated documents", async () => {
    rpc.mockResolvedValue({ data: "rev-3", error: null });
    await recordRevenue({
      sourceRef: "manual_invoice:abc",
      transactionType: "purchase",
      amount: 27258,
      description: "Invoice for Apexlynx",
      city: "Bengaluru",
      revenueDate: "2026-08-08",
    });
    expect(rpc.mock.calls[0][1].p_revenue_date).toBe("2026-08-08");
  });

  it("returns null when there is nothing to record", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(
      recordRevenue({ sourceRef: "comp:1", transactionType: "purchase", amount: 0, description: "comp" }),
    ).resolves.toBeNull();
  });

  it("surfaces failures instead of losing the sale", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "not authorised" } });
    await expect(
      recordRevenue({ sourceRef: "y:1", transactionType: "purchase", amount: 5, description: "d" }),
    ).rejects.toMatchObject({ message: "not authorised" });
  });

  it("defaults every optional field so the row is never half-written", async () => {
    rpc.mockResolvedValue({ data: "rev-4", error: null });
    await recordRevenue({ sourceRef: "z:1", transactionType: "payment", amount: 1, description: "d" });
    const args = rpc.mock.calls[0][1];
    for (const key of [
      "p_city", "p_currency", "p_user_id", "p_booking_id", "p_product_id",
      "p_hours_transaction_id", "p_gateway_name", "p_revenue_date", "p_guest_name", "p_guest_email",
    ]) {
      expect(args[key]).toBeNull();
    }
    expect(args.p_metadata).toEqual({});
  });
});
