import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const src = fs.readFileSync(
  path.resolve(__dirname, "../useCorporateAccounts.ts"),
  "utf8"
);

describe("corporate account city filtering", () => {
  it("uses the server-side corporate_account_cities view", () => {
    expect(src).toContain('from("corporate_account_cities")');
  });

  it("no longer builds a giant client-side .or() id list", () => {
    expect(src).not.toContain("user_id.in.(");
    expect(src).not.toContain("limit(5000)");
  });

  it("surfaces mapping errors instead of returning an empty list", () => {
    expect(src).toContain("if (mapErr) throw mapErr;");
  });

  it("scopes corporate billing items to the selected city plus global items", () => {
    expect(src).toContain("city.eq.${city},city.is.null");
  });
});
