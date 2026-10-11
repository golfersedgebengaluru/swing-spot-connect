import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { generateGSTR1Excel, isB2cl, type Invoice } from "../gstr1-export";

const state = vi.hoisted(() => ({ invoices: [] as Record<string, unknown>[], lines: [] as Record<string, unknown>[], error: false, credits: [] as Record<string, unknown>[] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  let selection = "";
  const builder: Record<string, unknown> = {};
  for (const method of ["eq", "gte", "lte", "in", "order"]) builder[method] = () => builder;
  builder.select = (fields: string) => { selection = fields; return builder; };
  builder.maybeSingle = async () => ({ data: { gstin: "29AAJFT3960B1Z3", is_gst_registered: true, state: "Karnataka", state_code: "29" }, error: null });
  builder.range = async () => ({ data: table === "invoices" ? state.invoices : state.lines, error: state.error ? new Error("Read failed") : null });
  builder.then = (resolve: (value: unknown) => unknown) => resolve({ data: table === "invoices" && selection === "credit_note_for" ? state.credits : [], error: null });
  return builder;
} } }));
vi.mock("xlsx", async (importOriginal) => {
  const actual = await importOriginal<typeof XLSX>();
  return { ...actual, writeFile: vi.fn() };
});
const base = {
  id: "i", invoice_number: "INV/1", invoice_date: "2026-09-28", invoice_type: "invoice", status: "issued",
  city: "Bengaluru", customer_gstin: null, customer_state_code: "29", customer_state: "Karnataka", business_state_code: "29",
  subtotal: 1000, cgst_total: 25, sgst_total: 25, igst_total: 0, total: 1050,
};
const item = { id: "l", invoice_id: "i", item_name: "SuperSpeed Pro", item_type: "product", product_id: null,
  hsn_code: "9506", sac_code: null, quantity: 1, unit_price: 1050, gst_rate: 5, line_total: 1050, cgst_amount: 25, sgst_amount: 25, igst_amount: 0 };
beforeEach(() => { state.invoices = [{ ...base }]; state.lines = [{ ...item }]; state.credits = []; state.error = false; vi.clearAllMocks(); });
describe("GSTR-1 workbook integration", () => {
  it("exports actual sheets, business dates and invoice values with visible review warnings", async () => {
    const result = await generateGSTR1Excel("Bengaluru", 2026, 9);
    expect(result.reviewCount).toBeGreaterThan(0);
    const [book, filename] = vi.mocked(XLSX.writeFile).mock.calls[0];
    expect(filename).toBe("GSTR1_Bengaluru_Sep-2026.xlsx");
    expect(book.SheetNames).toEqual(["B2B", "B2CL", "B2CS", "CDNR", "CDNUR", "HSN", "HSN B2B", "HSN B2C", "Product Breakdown", "Review Exceptions", "Reconciliation", "Filing Notes", "Docs"]);
    expect(XLSX.utils.sheet_to_json(book.Sheets["Product Breakdown"])[0]).toMatchObject({ "Invoice Date": "2026-09-28", "Selling Value (INR)": 1050 });
    expect(XLSX.utils.sheet_to_json(book.Sheets.HSN)[0]).toMatchObject({ "Total Value": 1050, "Supply Type": "B2C" });
  });
  it("includes original cancelled-by-credit supplies and subtracts the note, not twice", async () => {
    state.invoices = [{ ...base, status: "cancelled" }, { ...base, id: "cn", invoice_number: "CN/1", invoice_type: "credit_note", credit_note_for: "i" }];
    state.lines = [{ ...item }, { ...item, id: "cl", invoice_id: "cn" }];
    state.credits = [{ credit_note_for: "i" }];
    await generateGSTR1Excel("Bengaluru", 2026, 9);
    const [book] = vi.mocked(XLSX.writeFile).mock.calls[0];
    expect(XLSX.utils.sheet_to_json(book.Sheets.HSN)[0]).toMatchObject({ "Total Quantity": 0, "Total Value": 0 });
    expect(XLSX.utils.sheet_to_json(book.Sheets.B2CS)[0]).toMatchObject({ "Taxable Value": 1000 });
    expect(XLSX.utils.sheet_to_json(book.Sheets.Docs)[0]).toMatchObject({ Cancelled: 0, "Net Issued": 1 });
  });
  it("excludes truly void invoice lines but includes cancelled documents", async () => {
    state.invoices = [{ ...base, status: "cancelled" }];
    await generateGSTR1Excel("Bengaluru", 2026, 9);
    const [book] = vi.mocked(XLSX.writeFile).mock.calls[0];
    expect(XLSX.utils.sheet_to_json(book.Sheets["Product Breakdown"])).toEqual([]);
    expect(XLSX.utils.sheet_to_json(book.Sheets.Docs)[0]).toMatchObject({ Cancelled: 1, "Net Issued": 0 });
  });
  it("fails on read errors instead of downloading incomplete data", async () => {
    state.error = true;
    await expect(generateGSTR1Excel("Bengaluru", 2026, 9)).rejects.toThrow("Read failed");
    expect(XLSX.writeFile).not.toHaveBeenCalled();
  });
  it("keeps inter-state unregistered invoices above INR 100000 out of B2CS", async () => {
    state.invoices = [{ ...base, customer_state_code: "33", customer_state: "Tamil Nadu", total: 100001 }];
    await generateGSTR1Excel("Bengaluru", 2026, 9);
    const [book] = vi.mocked(XLSX.writeFile).mock.calls[0];
    expect(XLSX.utils.sheet_to_json(book.Sheets.B2CL)).toHaveLength(1);
    expect(XLSX.utils.sheet_to_json(book.Sheets.B2CS)).toEqual([]);
  });
  it("honours B2CL threshold/date boundaries and excludes registered/local recipients", () => {
    const inv = { ...base, customer_state_code: "33", total: 100000 } as Invoice;
    expect(isB2cl(inv)).toBe(false);
    expect(isB2cl({ ...inv, total: 100001 })).toBe(true);
    expect(isB2cl({ ...inv, total: 100001, invoice_date: "2024-07-31" })).toBe(false);
    expect(isB2cl({ ...inv, total: 250001, invoice_date: "2024-07-31" })).toBe(true);
    expect(isB2cl({ ...inv, total: 250001, customer_state_code: "29" })).toBe(false);
    expect(isB2cl({ ...inv, total: 250001, customer_gstin: "29AAJFT3960B1Z3" })).toBe(false);
  });
});