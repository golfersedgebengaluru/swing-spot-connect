import { describe, expect, it } from "vitest";
import { neutralizeFormula, safeCsv, safeCsvCell } from "../spreadsheet-safe";

describe("spreadsheet formula neutralization", () => {
  it.each(["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)", "  =cmd", "\t=1", "\r=1"])(
    "prefixes formula-leading text %j",
    (v) => {
      expect(neutralizeFormula(v)).toBe(`'${v}`);
    },
  );

  it("keeps real numbers and ordinary text unchanged", () => {
    expect(neutralizeFormula(-1500)).toBe(-1500);
    expect(neutralizeFormula("-1500.00")).toBe("-1500.00");
    expect(neutralizeFormula("Akshath & Vilvaa")).toBe("Akshath & Vilvaa");
    expect(neutralizeFormula(null)).toBe(null);
  });

  it("quotes and escapes CSV cells after neutralizing", () => {
    expect(safeCsvCell('=1+"a"')).toBe(`"'=1+""a"""`);
    expect(safeCsvCell(undefined)).toBe('""');
    expect(safeCsv([["Name", "Amount"], ["@evil", -20]])).toBe(`"Name","Amount"\n"'@evil","-20"`);
  });
});
