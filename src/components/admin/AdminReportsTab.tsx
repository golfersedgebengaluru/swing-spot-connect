import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const effectiveCity = globalCity || (cities && cities.length > 0 ? cities[0] : "");

  const availableTabs = [
    { id: "revenue", label: "Revenue", always: true },
    { id: "expense_reports", label: "Expense Reports", visible: showExpenseReports },
    { id: "pnl", label: "P&L", visible: showPnl },
    { id: "profitability", label: "Product Profitability", visible: showProfitability },
  ].filter((t) => t.always || t.visible);

  const [tab, setTab] = useState("revenue");

  if (loadingPerms || loadingCities) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  return (
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
          <ProductProfitabilityReport city={globalCity || undefined} />
        </TabsContent>
      )}
    </Tabs>
  );
}
