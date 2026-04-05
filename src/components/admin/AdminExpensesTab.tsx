import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MapPin, Loader2 } from "lucide-react";
import { ExpensesList } from "@/components/admin/ExpensesList";
import { useAdmin } from "@/hooks/useAdmin";
import { useAllCities } from "@/hooks/useBookings";
import { useAdminCity } from "@/contexts/AdminCityContext";

function useAvailableCities() {
  const { isAdmin, assignedCities } = useAdmin();
  const { data: allCities, isLoading } = useAllCities();
  const cities = isAdmin
    ? allCities
    : (allCities ?? []).filter((c) => assignedCities.includes(c));
  return { data: cities, isLoading };
}

export function AdminExpensesTab() {
  const { data: cities, isLoading: loadingCities } = useAvailableCities();
  const { selectedCity: globalCity } = useAdminCity();
  const [localCity, setLocalCity] = useState<string>("");

  useEffect(() => {
    if (cities?.length && !localCity) {
      setLocalCity(cities[0]);
    }
  }, [cities, localCity]);

  const selectedCity = globalCity || localCity;

  if (loadingCities) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  if (!cities?.length) {
    return <p className="text-center text-muted-foreground py-12">No cities configured. Set up a city in Bay Config first.</p>;
  }

  return (
    <div className="space-y-4">
      {!globalCity && (
        <div className="flex items-center gap-3">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <Select value={localCity} onValueChange={setLocalCity}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select instance" />
            </SelectTrigger>
            <SelectContent>
              {cities.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="outline" className="text-xs">{localCity}</Badge>
        </div>
      )}

      {selectedCity && <ExpensesList city={selectedCity} />}
    </div>
  );
}
