import { describe, it, expect } from "vitest";
import { calculateDiscount, ValidateCouponResult } from "../useCoupons";

describe("calculateDiscount", () => {
  it("returns 0 when result is not valid", () => {
    const result: ValidateCouponResult = { valid: false, error: "Invalid" };
    expect(calculateDiscount(result, 1000)).toBe(0);
  });

  it("calculates percentage discount correctly", () => {
    const result: ValidateCouponResult = {
      valid: true,
      coupon_id: "c1",
      discount_type: "percentage",
      discount_value: 25,
      code: "SAVE25",
    };
    expect(calculateDiscount(result, 1000)).toBe(250);
  });

  it("handles 100% discount", () => {
    const result: ValidateCouponResult = {
      valid: true,
      coupon_id: "c2",
      discount_type: "percentage",
      discount_value: 100,
      code: "FREE",
    };
    expect(calculateDiscount(result, 500)).toBe(500);
  });

  it("calculates fixed discount correctly", () => {
    const result: ValidateCouponResult = {
      valid: true,
      coupon_id: "c3",
      discount_type: "fixed",
      discount_value: 200,
      code: "FLAT200",
    };
    expect(calculateDiscount(result, 1000)).toBe(200);
  });

  it("clamps fixed discount to order total", () => {
    const result: ValidateCouponResult = {
      valid: true,
      coupon_id: "c4",
      discount_type: "fixed",
      discount_value: 500,
      code: "FLAT500",
    };
    expect(calculateDiscount(result, 300)).toBe(300);
  });

  it("handles zero order total", () => {
    const result: ValidateCouponResult = {
      valid: true,
      coupon_id: "c5",
      discount_type: "percentage",
      discount_value: 50,
      code: "HALF",
    };
    expect(calculateDiscount(result, 0)).toBe(0);
  });

  it("returns 0 when discount_value is missing", () => {
    const result: ValidateCouponResult = {
      valid: true,
      coupon_id: "c6",
      discount_type: "percentage",
    };
    expect(calculateDiscount(result, 1000)).toBe(0);
  });

  it("rounds percentage discount to 2 decimal places", () => {
    const result: ValidateCouponResult = {
      valid: true,
      coupon_id: "c7",
      discount_type: "percentage",
      discount_value: 33,
      code: "SAVE33",
    };
    // 33% of 100 = 33.00
    expect(calculateDiscount(result, 100)).toBe(33);
    // 33% of 99.99 = 32.9967 → 33.00
    expect(calculateDiscount(result, 99.99)).toBe(33);
  });
});
