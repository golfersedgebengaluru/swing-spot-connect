import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MapPin } from "lucide-react";
import { AdminRevenueTab } from "@/components/admin/AdminRevenueTab";
import { ExpenseReports } from "@/components/admin/ExpenseReports";
import { ProfitLossView } from "@/components/admin/ProfitLossView";
import { ProductProfitabilityReport } from "@/components/admin/ProductProfitabilityReport";
import { useAdmin } from "@/hooks/useAdmin";
import { useSiteAdminPermissions } from "@/hooks/useSiteAdminPermissions";
import { useAdminCity } from "@/contexts/AdminCityContext";
import { useAllCities } from "@/hooks/useBookings";
import { Loader2 } from "lucide-react";

export function AdminReportsTab() {
  const { isAdmin, isSiteAdmin, assignedCities } = useAdmin();
  const { data: permissions, isLoading: loadingPerms } = useSiteAdminPermissions();
  const { selectedCity: globalCity } = useAdminCity();
  const { data: allCities, isLoading: loadingCities } = useAllCities();

  // Determine which tabs are visible
  const showExpenseReports = isAdmin || (isSiteAdmin && permissions?.site_admin_expense_reports_visible);
  const showPnl = isAdmin || (isSiteAdmin && permissions?.site_admin_pnl_visible);
  const showProfitability = isAdmin || (isSiteAdmin && permissions?.site_admin_product_profitability_visible);

  // Determine city for city-scoped reports
  const cities = isAdmin ? allCities : (allCities ?? []).filter((c) => assignedCities.includes(c));
  const [localCity, setLocalCity] = useState<string>("");

  useEffect(() => {
    if (cities?.length && !localCity) setLocalCity(cities[0]);
  }, [cities, localCity]);

  const effectiveCity = globalCity || localCity;

  const availableTabs = [
    { id: "revenue", label: "Revenue", always: true },
    { id: "expense_reports", label: "Expense Reports", visible: showExpenseReports },
    { id: "pnl", label: "P&L", visible: showPnl },
    { id: "profitability", label: "Product Profitability", visible: showProfitability },
  ].filter((t) => t.always || t.visible);

  const [tab, setTab] = useState("revenue");

  if (loadingPerms || loadingCities) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
    <div className="space-y-4">
      {!globalCity && cities && cities.length > 0 && tab !== "revenue" && (
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
          {availableTabs.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="revenue">
          <AdminRevenueTab />
        </TabsContent>

        {showExpenseReports && (
          <TabsContent value="expense_reports">
            {effectiveCity && <ExpenseReports city={effectiveCity} />}
          </TabsContent>
        )}

        {showPnl && (
          <TabsContent value="pnl">
            {effectiveCity && <ProfitLossView city={effectiveCity} />}
          </TabsContent>
        )}

        {showProfitability && (
          <TabsContent value="profitability">
            <ProductProfitabilityReport city={effectiveCity || undefined} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
