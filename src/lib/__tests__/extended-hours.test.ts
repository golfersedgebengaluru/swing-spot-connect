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
});
