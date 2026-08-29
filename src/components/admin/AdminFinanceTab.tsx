import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, MapPin } from "lucide-react";
import { usePerCityFyToggle } from "@/hooks/useRevenue";
import { AdminFinancialYearsCard } from "@/components/admin/AdminFinancialYearsCard";
import { InvoiceProfileCard } from "@/components/admin/InvoiceProfileCard";
import { CityPaymentsSection } from "@/components/admin/CityPaymentsSection";
import { AdvanceAccountsReport } from "@/components/admin/AdvanceAccountsReport";
import { useAdmin } from "@/hooks/useAdmin";
import { useAllCities } from "@/hooks/useBookings";
import { useAdminCity } from "@/contexts/AdminCityContext";

// Hook to get available cities scoped by role
function useAvailableCities() {
  const { isAdmin, assignedCities } = useAdmin();
  const { data: allCities, isLoading } = useAllCities();
  const cities = isAdmin
    ? allCities
    : (allCities ?? []).filter((c) => assignedCities.includes(c));
  return { data: cities, isLoading };
}


// ─── Main Tab ───────────────────────────────────────────
export function AdminFinanceTab() {
  const [tab, setTab] = useState("invoice_profile");
  const { isAdmin, isSiteAdmin } = useAdmin();
  const { data: perCityFyEnabled } = usePerCityFyToggle();
  const { data: cities, isLoading: loadingCities } = useAvailableCities();
  const { selectedCity: globalCity } = useAdminCity();
  const [localCity, setLocalCity] = useState<string>("");

  // Show per-city FY tab only when toggle is on AND user is site-admin (or admin)
  const showCityFY = !!perCityFyEnabled;

  // Auto-select first city
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
      {/* City selector - only show when global is "All Cities" */}
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

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="invoice_profile">Invoice Profile</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="advance_accounts">Advance Accounts</TabsTrigger>
          {showCityFY && <TabsTrigger value="financial_year">Financial Year</TabsTrigger>}
        </TabsList>
        <TabsContent value="invoice_profile">
          {selectedCity ? <InvoiceProfileCard city={selectedCity} /> : <p className="text-sm text-muted-foreground">Pick a city above to edit its invoice profile.</p>}
        </TabsContent>
        <TabsContent value="payments">
          {selectedCity && <CityPaymentsSection city={selectedCity} />}
        </TabsContent>
        <TabsContent value="advance_accounts">
          <AdvanceAccountsReport city={selectedCity || undefined} />
        </TabsContent>
        {showCityFY && (
          <TabsContent value="financial_year">
            {selectedCity && (
              <AdminFinancialYearsCard
                city={selectedCity}
                title={`Financial Year — ${selectedCity}`}
              />
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
