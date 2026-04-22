import { describe, it, expect } from "vitest";
import { getBookableWindow } from "@/lib/extended-hours";

describe("getBookableWindow", () => {
  const baseBay = { open_time: "09:00", close_time: "22:00" };

  it("returns null for a missing bay", () => {
    expect(getBookableWindow(null, true)).toBeNull();
    expect(getBookableWindow(undefined, false)).toBeNull();
  });

  it("returns the normal window when extended hours are not configured", () => {
    expect(getBookableWindow(baseBay, true)).toEqual({
      openTime: "09:00",
      closeTime: "22:00",
      extended: false,
    });
  });

  it("returns the normal window when caller does not have access", () => {
    const bay = {
      ...baseBay,
      extended_hours_enabled: true,
      extended_open_time: "06:00",
      extended_close_time: "23:30",
    };
    expect(getBookableWindow(bay, false)).toEqual({
      openTime: "09:00",
      closeTime: "22:00",
      extended: false,
    });
  });

  it("returns the normal window when bay toggle is disabled", () => {
    const bay = {
      ...baseBay,
      extended_hours_enabled: false,
      extended_open_time: "06:00",
      extended_close_time: "23:30",
    };
    expect(getBookableWindow(bay, true)).toEqual({
      openTime: "09:00",
      closeTime: "22:00",
      extended: false,
    });
  });

  it("widens the window when extended hours are enabled and access is granted", () => {
    const bay = {
      ...baseBay,
      extended_hours_enabled: true,
      extended_open_time: "06:00",
      extended_close_time: "23:30",
    };
    expect(getBookableWindow(bay, true)).toEqual({
      openTime: "06:00",
      closeTime: "23:30",
      extended: true,
    });
  });

  it("only extends earlier when extended_open is before normal open", () => {
    const bay = {
      ...baseBay,
      extended_hours_enabled: true,
      extended_open_time: "06:00",
      extended_close_time: "20:00", // earlier than normal close
    };
    expect(getBookableWindow(bay, true)).toEqual({
      openTime: "06:00",
      closeTime: "22:00",
      extended: true,
    });
  });

  it("only extends later when extended_close is after normal close", () => {
    const bay = {
      ...baseBay,
      extended_hours_enabled: true,
      extended_open_time: "10:00", // later than normal open
      extended_close_time: "23:30",
    };
    expect(getBookableWindow(bay, true)).toEqual({
      openTime: "09:00",
      closeTime: "23:30",
      extended: true,
    });
  });

  it("treats null extended fields as not configured", () => {
    const bay = {
      ...baseBay,
      extended_hours_enabled: true,
      extended_open_time: null,
      extended_close_time: null,
    };
    expect(getBookableWindow(bay, true)).toEqual({
      openTime: "09:00",
      closeTime: "22:00",
      extended: false,
    });
  });

  /**
   * Regression guard: Postgres `time` columns serialize as `"HH:MM:SS"`. The
   * downstream `list_slots` edge function appends `:00` for seconds and parses
   * the result with `Intl.DateTimeFormat`, which throws `RangeError: Invalid
   * time value` if it sees `"06:00:00:00"`. The helper must trim seconds so
   * both code paths produce valid `YYYY-MM-DDTHH:MM:00<offset>` strings.
   */
  it("normalizes HH:MM:SS inputs to HH:MM (extended fields)", () => {
    const bay = {
      open_time: "09:00",
      close_time: "22:00",
      extended_hours_enabled: true,
      extended_open_time: "06:00:00",
      extended_close_time: "23:30:00",
    };
    expect(getBookableWindow(bay, true)).toEqual({
      openTime: "06:00",
      closeTime: "23:30",
      extended: true,
    });
  });

  it("normalizes HH:MM:SS inputs on normal open/close fields", () => {
    const bay = {
      open_time: "09:00:00",
      close_time: "22:00:00",
    };
    expect(getBookableWindow(bay, false)).toEqual({
      openTime: "09:00",
      closeTime: "22:00",
      extended: false,
    });
  });

  it("does not flag extended=true when seconds are the only difference", () => {
    const bay = {
      open_time: "09:00",
      close_time: "22:00",
      extended_hours_enabled: true,
      extended_open_time: "09:00:00",
      extended_close_time: "22:00:00",
    };
    expect(getBookableWindow(bay, true)).toEqual({
      openTime: "09:00",
      closeTime: "22:00",
      extended: false,
    });
  });
});

/**
 * Admin-side gating: the Manual Booking dialog only widens the slot query when both
 * (a) the selected customer has `extended_hours_access` and (b) the bay has the
 * extended window enabled. Walk-in (guest) bookings never qualify.
 *
 * This mirrors the runtime expression:
 *   canUseExtended         = customerHasExtendedAccess && bay.extended_hours_enabled
 *   effectiveShowExtended  = adminToggleOn && canUseExtended
 *   window                 = getBookableWindow(bay, effectiveShowExtended)
 */
describe("admin extended-hours gating", () => {
  const bay = {
    open_time: "09:00",
    close_time: "22:00",
    extended_hours_enabled: true,
    extended_open_time: "06:00",
    extended_close_time: "23:30",
  };

  const computeWindow = (
    customerHasAccess: boolean,
    bayExtendedEnabled: boolean,
    adminToggleOn: boolean,
  ) => {
    const cfg = { ...bay, extended_hours_enabled: bayExtendedEnabled };
    const canUseExtended = customerHasAccess && bayExtendedEnabled;
    const effective = adminToggleOn && canUseExtended;
    return getBookableWindow(cfg, effective);
  };

  it("walk-in guest (no profile) always uses the normal window", () => {
    // Walk-ins pass `false` directly — never widen.
    expect(getBookableWindow(bay, false)).toEqual({
      openTime: "09:00",
      closeTime: "22:00",
      extended: false,
    });
  });

  it("uses normal window when the customer lacks extended-hours access", () => {
    expect(computeWindow(false, true, true)?.openTime).toBe("09:00");
    expect(computeWindow(false, true, true)?.extended).toBe(false);
  });

  it("uses normal window when bay-level extended hours is disabled", () => {
    expect(computeWindow(true, false, true)?.openTime).toBe("09:00");
    expect(computeWindow(true, false, true)?.extended).toBe(false);
  });

  it("uses normal window by default even for eligible customers (toggle off)", () => {
    // Regression guard for the Apr 23/24 bug: admin dialog must not widen
    // automatically — the public flow narrowness is the safe default.
    expect(computeWindow(true, true, false)?.openTime).toBe("09:00");
    expect(computeWindow(true, true, false)?.extended).toBe(false);
  });

  it("widens only when customer has access, bay supports it, and admin opts in", () => {
    expect(computeWindow(true, true, true)).toEqual({
      openTime: "06:00",
      closeTime: "23:30",
      extended: true,
    });
  });
});
