import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  bookingCharge,
  bookingDurationMinutes,
  couponDiscount,
  dayTypeForDate,
  isLocalDateOfStart,
} from "../../../supabase/functions/_shared/checkout-pricing";
import { isServiceRoleToken } from "../../../supabase/functions/_shared/trusted-caller";
import { authorizeEmailRequest } from "../../../supabase/functions/send-notification-email/authorize";

const read = (p: string) => readFileSync(resolve(__dirname, "../../../", p), "utf8");

describe("server-side checkout pricing", () => {
  it("charges the listed hourly rate for the reserved duration minus a valid coupon", () => {
    const discount = couponDiscount({ valid: true, discount_type: "percentage", discount_value: 10 }, 1500);
    expect(bookingCharge(1000, 90, discount)).toEqual({ total: 1500, discount: 150, amount: 1350 });
  });

  it("clamps fixed coupons to the order total and ignores invalid coupons", () => {
    expect(couponDiscount({ valid: true, discount_type: "fixed", discount_value: 5000 }, 1000)).toBe(1000);
    expect(couponDiscount({ valid: false, discount_type: "fixed", discount_value: 500 }, 1000)).toBe(0);
  });

  it("uses weekend rates for Saturday and Sunday dates", () => {
    expect(dayTypeForDate("2026-11-07")).toBe("weekend");
    expect(dayTypeForDate("2026-11-09")).toBe("weekday");
  });

  it("rejects a booking date that cannot be the start time's local date", () => {
    expect(isLocalDateOfStart("2026-11-07", "2026-11-06T20:00:00Z")).toBe(true); // IST next day
    expect(isLocalDateOfStart("2026-11-09", "2026-11-07T04:00:00Z")).toBe(false);
  });

  it("derives hours from the reserved time range", () => {
    expect(bookingDurationMinutes("2026-11-07T04:00:00Z", "2026-11-07T07:00:00Z")).toBe(180);
    expect(bookingDurationMinutes("2026-11-07T07:00:00Z", "2026-11-07T04:00:00Z")).toBeNull();
  });

  it("checkout screens no longer send prices or create pending records", () => {
    for (const page of ["src/pages/PublicBooking.tsx", "src/pages/Dashboard.tsx"]) {
      const src = read(page);
      expect(src).not.toMatch(/from\("pending_(guest_)?bookings"\)\.insert|from\("pending_purchases"\)\.insert/);
      expect(src).not.toMatch(/amount: amountToCharge,\s*\n\s*currency/);
    }
    expect(read("supabase/functions/create-razorpay-order/index.ts")).not.toMatch(/amount: z\.number/);
  });
});

describe("trusted backend caller", () => {
  it("accepts only the exact service credential", () => {
    expect(isServiceRoleToken("Bearer secret-key", "secret-key")).toBe(true);
    expect(isServiceRoleToken("Bearer secret-kez", "secret-key")).toBe(false);
    expect(isServiceRoleToken(null, "secret-key")).toBe(false);
    expect(isServiceRoleToken("Bearer ", undefined)).toBe(false);
  });

  it("guards booking finalization, guest bookings and gateway-paid member bookings", () => {
    const src = read("supabase/functions/calendar-sync/index.ts");
    const finalize = src.slice(src.indexOf('action === "finalize_pending_member_booking"'));
    expect(finalize.slice(0, 400)).toMatch(/isServiceRoleToken/);
    const guest = src.slice(src.indexOf('action === "guest_booking"'));
    expect(guest.slice(0, 900)).toMatch(/isServiceRoleToken[\s\S]*is_admin_or_site_admin/);
    const create = src.slice(src.indexOf('action === "create_booking"'));
    expect(create.slice(0, 1400)).toMatch(/bookingDurationMinutes\(/);
    expect(create.slice(0, 1400)).toMatch(/Paid bookings must be made through checkout/);
  });
});

describe("email sending authorization", () => {
  const base = {
    isService: false, callerId: "u1", isStaff: false, template: "points_earned",
    hasRecipientEmail: false, hasUserId: true, isTest: false, targetIsSelf: true, callerCoachesTarget: false,
  };
  it("rejects anonymous callers", () => {
    expect(authorizeEmailRequest({ ...base, callerId: null }).ok).toBe(false);
  });
  it("rejects browser-chosen recipient addresses, even for staff", () => {
    expect(authorizeEmailRequest({ ...base, isStaff: true, hasRecipientEmail: true }).ok).toBe(false);
  });
  it("lets members email only themselves with member templates", () => {
    expect(authorizeEmailRequest(base).ok).toBe(true);
    expect(authorizeEmailRequest({ ...base, targetIsSelf: false }).ok).toBe(false);
    expect(authorizeEmailRequest({ ...base, template: "admin_new_booking" }).ok).toBe(false);
  });
  it("lets coaches send session emails only to their students", () => {
    const coach = { ...base, template: "coaching_session_added", targetIsSelf: false };
    expect(authorizeEmailRequest({ ...coach, callerCoachesTarget: true }).ok).toBe(true);
    expect(authorizeEmailRequest(coach).ok).toBe(false);
  });
  it("allows staff and backend functions", () => {
    expect(authorizeEmailRequest({ ...base, isStaff: true, targetIsSelf: false, isTest: true }).ok).toBe(true);
    expect(authorizeEmailRequest({ ...base, isService: true, callerId: null, hasRecipientEmail: true }).ok).toBe(true);
  });
});
