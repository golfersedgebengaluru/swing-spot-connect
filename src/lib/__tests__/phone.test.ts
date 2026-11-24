import { describe, expect, it } from "vitest";
import { isValidPhone } from "@/lib/phone";

describe("isValidPhone", () => {
  it("rejects a sign-up with no mobile number (only the country code)", () => {
    expect(isValidPhone("+91")).toBe(false);
    expect(isValidPhone("")).toBe(false);
    expect(isValidPhone(null)).toBe(false);
  });

  it("accepts a full Indian mobile number", () => {
    expect(isValidPhone("+91 9980877844")).toBe(true);
  });
});
