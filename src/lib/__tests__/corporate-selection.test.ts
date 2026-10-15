import { describe, expect, it } from "vitest";
import { canRegisterCorporateMember, resolveCorporateSelection } from "../corporate-selection";

describe("corporate registration and payer selection", () => {
  it("permits standard registration without an account", () => expect(canRegisterCorporateMember("Member", false, [])).toBe(true));
  it("rejects corporate registration without a membership", () => expect(canRegisterCorporateMember("Member", true, [])).toBe(false));
  it("accepts multiple corporate memberships", () => expect(canRegisterCorporateMember("Member", true, ["A", "B"])).toBe(true));
  it("selects the only eligible account", () => expect(resolveCorporateSelection(["A"], "")).toBe("A"));
  it("requires an explicit choice for multiple accounts", () => expect(resolveCorporateSelection(["A", "B"], "")).toBeNull());
  it("uses the chosen account rather than the first account", () => expect(resolveCorporateSelection(["A", "B"], "B")).toBe("B"));
  it("rejects a stale account choice", () => expect(resolveCorporateSelection(["C", "D"], "B")).toBeNull());
});