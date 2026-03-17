import { useMemo } from "react";
import { useBays, useUserProfile } from "@/hooks/useBookings";
import { getCurrencySymbol, formatPrice } from "@/lib/currencies";

/**
 * Returns the currency code & symbol based on user's preferred city (or first available bay).
 */
export function useDefaultCurrency() {
  const { data: bays } = useBays();
  const { data: profile } = useUserProfile();

  return useMemo(() => {
    const preferredCity = profile?.preferred_city;
    const activeBays = (bays ?? []).filter((b: any) => b.is_active);

    // Try preferred city first, then fall back to first available bay
    const matchedBay = preferredCity
      ? activeBays.find((b: any) => b.city === preferredCity)
      : activeBays[0];

    const code = matchedBay?.currency ?? "INR";
    const symbol = getCurrencySymbol(code);

    return { code, symbol, format: (amount: number) => formatPrice(amount, code) };
  }, [bays, profile]);
}

/**
 * Returns the currency for a specific city from bays config.
 */
export function useCityBaysCurrency(city: string | undefined) {
  const { data: bays } = useBays();

  return useMemo(() => {
    if (!city) return { code: "INR", symbol: "₹", format: (amount: number) => formatPrice(amount, "INR") };
    const bay = (bays ?? []).find((b: any) => b.city === city && b.is_active);
    const code = bay?.currency ?? "INR";
    const symbol = getCurrencySymbol(code);
    return { code, symbol, format: (amount: number) => formatPrice(amount, code) };
  }, [bays, city]);
}
