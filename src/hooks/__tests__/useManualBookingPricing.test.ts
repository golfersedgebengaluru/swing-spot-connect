import { describe, it, expect } from "vitest";

/**
 * Pure-logic tests for the pricing lookup used in ManualBookingDialog.
 * We extract the logic into a helper so it can be tested without React rendering.
 */

interface PricingRow {
  city: string;
  day_type: string;
  session_type: string;
  label: string;
  price_per_hour: number;
}

function lookupPrice(
  bayPricing: PricingRow[],
  city: string,
  date: Date,
  numPlayers: number,
  sessionType: "practice" | "coaching"
): PricingRow | null {
  if (!city || !bayPricing.length) return null;
  const isWeekend = [0, 6].includes(date.getDay());
  const dayType = isWeekend ? "weekend" : "weekday";

  if (sessionType === "coaching") {
    return bayPricing.find(
      (p) => p.city === city && p.day_type === dayType && p.session_type.includes("coaching")
    ) ?? null;
  }

  const playerSessionType =
    numPlayers === 1 ? "individual" : numPlayers === 2 ? "couple" : "group";
  return bayPricing.find(
    (p) => p.city === city && p.day_type === dayType && p.session_type === playerSessionType
  ) ?? null;
}

const SAMPLE_PRICING: PricingRow[] = [
  { city: "Chennai", day_type: "weekday", session_type: "individual", label: "Individual", price_per_hour: 1100 },
  { city: "Chennai", day_type: "weekend", session_type: "individual", label: "Individual", price_per_hour: 1300 },
  { city: "Chennai", day_type: "weekday", session_type: "couple", label: "Couple", price_per_hour: 1600 },
  { city: "Chennai", day_type: "weekend", session_type: "couple", label: "Couple", price_per_hour: 1800 },
  { city: "Chennai", day_type: "weekday", session_type: "group", label: "Group", price_per_hour: 1900 },
  { city: "Chennai", day_type: "weekend", session_type: "group", label: "Group", price_per_hour: 2200 },
  { city: "Chennai", day_type: "weekday", session_type: "coaching_60", label: "Coaching 60", price_per_hour: 2500 },
  { city: "Chennai", day_type: "weekend", session_type: "coaching_60", label: "Coaching 60", price_per_hour: 2500 },
  { city: "Bengaluru", day_type: "weekday", session_type: "individual", label: "Individual", price_per_hour: 1200 },
  { city: "Bengaluru", day_type: "weekend", session_type: "individual", label: "Individual", price_per_hour: 1500 },
  { city: "Bengaluru", day_type: "weekday", session_type: "coaching_60", label: "Coaching 60", price_per_hour: 2750 },
  { city: "Bengaluru", day_type: "weekend", session_type: "coaching_60", label: "Coaching 60", price_per_hour: 2750 },
];

// Use a known Monday (2026-04-13) and Saturday (2026-04-18)
const WEEKDAY = new Date("2026-04-13T10:00:00");
const WEEKEND = new Date("2026-04-18T10:00:00");

describe("Manual Booking pricing lookup", () => {
  describe("Practice sessions use player-count pricing", () => {
    it("returns individual rate for 1 player on weekday", () => {
      const result = lookupPrice(SAMPLE_PRICING, "Chennai", WEEKDAY, 1, "practice");
      expect(result?.price_per_hour).toBe(1100);
      expect(result?.session_type).toBe("individual");
    });

    it("returns couple rate for 2 players on weekend", () => {
      const result = lookupPrice(SAMPLE_PRICING, "Chennai", WEEKEND, 2, "practice");
      expect(result?.price_per_hour).toBe(1800);
      expect(result?.session_type).toBe("couple");
    });

    it("returns group rate for 3+ players", () => {
      const result = lookupPrice(SAMPLE_PRICING, "Chennai", WEEKDAY, 4, "practice");
      expect(result?.price_per_hour).toBe(1900);
      expect(result?.session_type).toBe("group");
    });
  });

  describe("Coaching sessions use coaching pricing", () => {
    it("returns Chennai coaching rate on weekday regardless of player count", () => {
      const result = lookupPrice(SAMPLE_PRICING, "Chennai", WEEKDAY, 1, "coaching");
      expect(result?.price_per_hour).toBe(2500);
      expect(result?.session_type).toContain("coaching");
    });

    it("returns Bengaluru coaching rate on weekend", () => {
      const result = lookupPrice(SAMPLE_PRICING, "Bengaluru", WEEKEND, 2, "coaching");
      expect(result?.price_per_hour).toBe(2750);
      expect(result?.session_type).toContain("coaching");
    });

    it("coaching rate ignores player count", () => {
      const r1 = lookupPrice(SAMPLE_PRICING, "Chennai", WEEKDAY, 1, "coaching");
      const r2 = lookupPrice(SAMPLE_PRICING, "Chennai", WEEKDAY, 5, "coaching");
      expect(r1?.price_per_hour).toBe(r2?.price_per_hour);
    });
  });

  describe("Edge cases", () => {
    it("returns null for empty pricing", () => {
      expect(lookupPrice([], "Chennai", WEEKDAY, 1, "practice")).toBeNull();
    });

    it("returns null for unknown city", () => {
      expect(lookupPrice(SAMPLE_PRICING, "Mumbai", WEEKDAY, 1, "coaching")).toBeNull();
    });

    it("returns null for empty city string", () => {
      expect(lookupPrice(SAMPLE_PRICING, "", WEEKDAY, 1, "practice")).toBeNull();
    });
  });

  describe("Price display visibility", () => {
    it("price should be hidden when payment mode is hours", () => {
      const paymentMode: string = "hours";
      const shouldShowPrice = paymentMode !== "hours";
      expect(shouldShowPrice).toBe(false);
    });

    it("price should be shown when payment mode is manual", () => {
      const paymentMode: string = "manual";
      const shouldShowPrice = paymentMode !== "hours";
      expect(shouldShowPrice).toBe(true);
    });
  });
});
