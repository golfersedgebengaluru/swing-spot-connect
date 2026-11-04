import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CustomerFinanceDialog } from "../CustomerFinanceDialog";

const mocks = vi.hoisted(() => ({ query: vi.fn(), from: vi.fn(), report: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: mocks.query }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/hooks/useCustomerReport", () => ({ useCustomerReport: mocks.report }));
vi.mock("@/hooks/useCurrency", () => ({ useDefaultCurrency: () => ({ format: (value: number) => `INR ${value}` }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/hooks/useAdvanceAccount", () => ({
  useAdvanceBalance: () => ({ data: 1000, isLoading: false }),
  useAdvanceTransactions: () => ({ data: [{ id: "advance", amount: 1000, description: "Deposit", transaction_type: "credit", source_type: "manual_deposit", created_at: "2026-11-03T06:00:00Z" }], isLoading: false }),
  useAddAdvanceCredit: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
const invoice = { id: "membership", invoice_number: "INV/26-27/FY 2026-2027/1582", total: 25000, invoice_date: "2026-11-03", invoice_type: "invoice", status: "issued", payment_status: "paid" };
const credit = { ...invoice, id: "credit", invoice_number: "CN/1", total: 500, invoice_type: "credit_note" };
beforeEach(() => {
  cleanup(); vi.clearAllMocks();
  mocks.report.mockReturnValue({ data: { rows: [{ lifetime_spend: { INR: 24500 } }] } });
  mocks.query.mockImplementation(options => ({ data: options.queryKey[0] === "customer_invoice_history" ? [invoice, credit] : [credit], isLoading: false }));
});
function mount(open = true) { render(<CustomerFinanceDialog open={open} onOpenChange={vi.fn()} userId="user" profileId="profile" displayName="Rohan" city="Bengaluru" />); }
describe("Customer Finance document separation", () => {
  it("shows the ₹25,000 membership invoice once on November 3 without merging booking or advance representations", () => {
    mount();
    expect(screen.getAllByText("INR 25000")).toHaveLength(1);
    expect(screen.getByText("03 Nov 2026")).toBeTruthy();
    expect(screen.getAllByText("Deposit")).toHaveLength(1);
    expect(mocks.query.mock.calls.map(([options]) => options.queryKey[0])).toEqual(["customer_credit_notes", "customer_invoice_history"]);
  });
  it("keeps credit notes once and preserves the signed ledger spend independently of invoice sums", () => {
    mount();
    expect(screen.getAllByText("INR 500")).toHaveLength(1);
    expect(screen.getByText("INR 24500")).toBeTruthy();
    expect(mocks.report).toHaveBeenCalledWith({ _profile_id: "profile", _city: "Bengaluru" }, true);
  });
  it("queries both customer identities within the selected city and uses invoice dates", async () => {
    const chain: Record<string, unknown> = {};
    for (const key of ["select", "in", "eq", "order", "limit"]) chain[key] = vi.fn(() => chain);
    chain.then = (resolve: (value: unknown) => void) => resolve({ data: [invoice], error: null });
    mocks.from.mockReturnValue(chain); mount();
    const options = mocks.query.mock.calls[1][0];
    expect(await options.queryFn()).toEqual([invoice]);
    expect(mocks.from).toHaveBeenCalledWith("invoices");
    expect(chain.in).toHaveBeenCalledWith("customer_user_id", ["user", "profile"]);
    expect(chain.eq).toHaveBeenCalledWith("city", "Bengaluru");
    expect(chain.order).toHaveBeenCalledWith("invoice_date", { ascending: false });
  });
  it("does not query documents while closed", () => { mount(false); expect(mocks.query.mock.calls.every(([options]) => options.enabled === false)).toBe(true); });
  it("propagates denied invoice reads rather than silently returning an empty history", async () => {
    const chain: Record<string, unknown> = {};
    for (const key of ["select", "in", "eq", "order", "limit"]) chain[key] = () => chain;
    chain.then = (resolve: (value: unknown) => void) => resolve({ data: null, error: new Error("denied") });
    mocks.from.mockReturnValue(chain); mount();
    await expect(mocks.query.mock.calls[1][0].queryFn()).rejects.toThrow("denied");
  });
});