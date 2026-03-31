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
  const { isAdmin, assignedCities } = useAdmin();
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

  // If the stored city is no longer valid, reset to "all"
  useEffect(() => {
    if (!isLoading && cities.length > 0 && selectedCity && !cities.includes(selectedCity)) {
      setSelectedCityState("");
      try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
    }
  }, [cities, isLoading, selectedCity]);

  const setSelectedCity = (city: string) => {
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
        isLoadingCities: isLoading,
      }}
    >
      {children}
    </AdminCityContext.Provider>
  );
}

export function useAdminCity() {
  return useContext(AdminCityContext);
}
