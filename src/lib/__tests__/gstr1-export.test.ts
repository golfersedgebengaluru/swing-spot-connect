import { describe, it, expect } from "vitest";
import { groupLinesByRate } from "../gstr1-export";

const mkLine = (overrides: any = {}) => ({
  invoice_id: "x",
  item_name: "x",
  hsn_code: null,
  sac_code: null,
  quantity: 1,
  unit_price: 0,
  gst_rate: 0,
  cgst_amount: 0,
  sgst_amount: 0,
  igst_amount: 0,
  line_total: 0,
  product_id: null,
  ...overrides,
});

describe("groupLinesByRate", () => {
  it("reverse-calcs taxable from gross line_total", () => {
    // 2600 incl 18% → taxable 2203.39, gst 396.61 (cgst 198.30 + sgst 198.31)
    const lines = [mkLine({ gst_rate: 18, line_total: 2600, cgst_amount: 198.30, sgst_amount: 198.31 })];
    const m = groupLinesByRate(lines);
    const v = m.get(18)!;
    expect(v.gross).toBeCloseTo(2600, 2);
    expect(v.taxable).toBeCloseTo(2203.39, 2);
    expect(v.cgst + v.sgst).toBeCloseTo(396.61, 2);
  });

  it("splits a mixed-rate invoice into multiple buckets", () => {
    const lines = [
      mkLine({ gst_rate: 18, line_total: 1180, cgst_amount: 90, sgst_amount: 90 }),
      mkLine({ gst_rate: 5,  line_total: 1050, cgst_amount: 25, sgst_amount: 25 }),
    ];
    const m = groupLinesByRate(lines);
    expect(m.size).toBe(2);
    expect(m.get(18)!.taxable).toBeCloseTo(1000, 2);
    expect(m.get(5)!.taxable).toBeCloseTo(1000, 2);
  });

  it("handles IGST (inter-state) lines", () => {
    const lines = [mkLine({ gst_rate: 18, line_total: 1180, igst_amount: 180 })];
    const m = groupLinesByRate(lines);
    expect(m.get(18)!.taxable).toBeCloseTo(1000, 2);
    expect(m.get(18)!.igst).toBeCloseTo(180, 2);
  });
});
