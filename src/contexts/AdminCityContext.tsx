import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useAllCities } from "@/hooks/useBookings";
import { useAdmin } from "@/hooks/useAdmin";

interface AdminCityContextType {
  /** Empty string means "All Cities" */
  selectedCity: string;
  setSelectedCity: (city: string) => void;
  /** Cities available to this admin (role-scoped) */
  availableCities: string[];
  isLoadingCities: boolean;
}

const AdminCityContext = createContext<AdminCityContextType>({
  selectedCity: "",
  setSelectedCity: () => {},
  availableCities: [],
  isLoadingCities: true,
});

const STORAGE_KEY = "admin_selected_city";

export function AdminCityProvider({ children }: { children: ReactNode }) {
  const { isAdmin, assignedCities, loading: roleLoading } = useAdmin();
  const { data: allCities, isLoading } = useAllCities();

  const cities = isAdmin
    ? (allCities ?? [])
    : (allCities ?? []).filter((c) => assignedCities.includes(c));

  const [selectedCity, setSelectedCityState] = useState<string>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });

  // If the stored city is no longer valid, reset
  // For site_admins (non-admins), auto-select first city if none selected
  useEffect(() => {
    if (!isLoading && !roleLoading) {
      if (selectedCity && !cities.includes(selectedCity)) {
        // Invalid selection — reset
        const fallback = isAdmin ? "" : (cities[0] ?? "");
        setSelectedCityState(fallback);
        try { if (fallback) sessionStorage.setItem(STORAGE_KEY, fallback); else sessionStorage.removeItem(STORAGE_KEY); } catch {}
      } else if (!isAdmin && !selectedCity && cities.length > 0) {
        // Site admin with no city selected — auto-select first
        setSelectedCityState(cities[0]);
        try { sessionStorage.setItem(STORAGE_KEY, cities[0]); } catch {}
      }
    }
  }, [cities, isLoading, roleLoading, selectedCity, isAdmin]);

  const setSelectedCity = (city: string) => {
    if (roleLoading || isLoading || (city && !cities.includes(city)) || (!city && !isAdmin)) return;
    setSelectedCityState(city);
    try {
      if (city) sessionStorage.setItem(STORAGE_KEY, city);
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  return (
    <AdminCityContext.Provider
      value={{
        selectedCity,
        setSelectedCity,
        availableCities: cities,
        isLoadingCities: isLoading || roleLoading,
      }}
    >
      {children}
    </AdminCityContext.Provider>
  );
}

export function useAdminCity() {
  return useContext(AdminCityContext);
}
