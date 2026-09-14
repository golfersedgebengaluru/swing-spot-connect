import { describe, expect, it, vi } from "vitest";
import {
  classifyUser,
  countDistinctVisits,
  getHoursTone,
  identityKeys,
  isMemberRecord,
  matchesMemberFilter,
  shouldShowMemberSection,
} from "@/lib/member-utils";

describe("member classification", () => {
  it("treats any member_hours row, including a zero balance, as a member", () => {
    expect(isMemberRecord("hours-row")).toBe(true);
    expect(classifyUser(null, "hours-row")).toBe("member");
    expect(matchesMemberFilter("member", null, "hours-row")).toBe(true);
  });

  it("separates pre-registered and registered users by linked login account", () => {
    expect(classifyUser(null, null)).toBe("pre-registered");
    expect(classifyUser("auth-user", null)).toBe("registered");
    expect(matchesMemberFilter("all", null, null)).toBe(true);
  });
});

describe("remaining-hours presentation", () => {
  it("preserves the existing green, amber, and red thresholds", () => {
    expect(getHoursTone(4)).toBe("green");
    expect(getHoursTone(3)).toBe("amber");
    expect(getHoursTone(1)).toBe("red");
    expect(getHoursTone(0)).toBe("red");
  });
});

describe("Member360 derivations", () => {
  it("uses both profile and login identities without duplicates", () => {
    expect(identityKeys({ id: "profile", user_id: "auth" })).toEqual(["profile", "auth"]);
    expect(identityKeys({ id: "same", user_id: "same" })).toEqual(["same"]);
  });

  it("counts one paid, completed visit per booking group", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
    const bookings = [
      { id: "a", parent_booking_id: "group", start_time: "2026-09-10T10:00:00Z", status: "confirmed", billing_status: "invoiced", invoice_id: null },
      { id: "b", parent_booking_id: "group", start_time: "2026-09-10T10:30:00Z", status: "confirmed", billing_status: "invoiced", invoice_id: null },
      { id: "c", parent_booking_id: null, start_time: "2026-09-11T10:00:00Z", status: "confirmed", billing_status: null, invoice_id: null },
      { id: "future", parent_booking_id: null, start_time: "2026-09-20T10:00:00Z", status: "confirmed", billing_status: "invoiced", invoice_id: null },
      { id: "cancelled", parent_booking_id: null, start_time: "2026-09-09T10:00:00Z", status: "cancelled", billing_status: "invoiced", invoice_id: null },
    ];

    expect(countDistinctVisits(bookings, new Set(["c"]))).toBe(2);
    vi.useRealTimers();
  });

  it("omits unsupported empty sections", () => {
    expect(shouldShowMemberSection([])).toBe(false);
    expect(shouldShowMemberSection(undefined)).toBe(false);
    expect(shouldShowMemberSection([{}])).toBe(true);
  });
});