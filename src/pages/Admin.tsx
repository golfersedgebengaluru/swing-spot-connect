import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminDashboardTab } from "@/components/admin/AdminDashboardTab";
import { AdminEventsTab } from "@/components/admin/AdminEventsTab";
import { AdminProductsTab } from "@/components/admin/AdminProductsTab";
import { AdminRewardsTab } from "@/components/admin/AdminRewardsTab";
import { AdminEdgeRewardsTab } from "@/components/admin/AdminEdgeRewardsTab";
import { AdminMembersTab } from "@/components/admin/AdminMembersTab";
import { AdminAllUsersTab } from "@/components/admin/AdminAllUsersTab";
import { AdminPagesTab } from "@/components/admin/AdminPagesTab";
import { AdminBookingLogsTab } from "@/components/admin/AdminBookingLogsTab";
import { AdminSettingsTab } from "@/components/admin/AdminSettingsTab";

import { AdminEmailLogsTab } from "@/components/admin/AdminEmailLogsTab";
import { BayConfigTab } from "@/components/admin/BayConfigTab";
import { AdminPaymentsTab } from "@/components/admin/AdminPaymentsTab";
import { AdminPricingTab } from "@/components/admin/AdminPricingTab";
import { AdminRevenueTab } from "@/components/admin/AdminRevenueTab";
import { ExpenseReports } from "@/components/admin/ExpenseReports";
import { ProfitLossView } from "@/components/admin/ProfitLossView";
import { GSTR1DownloadCard } from "@/components/admin/GSTR1DownloadCard";
import { ProductProfitabilityReport } from "@/components/admin/ProductProfitabilityReport";
import { AdminWalkInBookingTab } from "@/components/admin/AdminWalkInBookingTab";
import { AdminFinanceTab } from "@/components/admin/AdminFinanceTab";
import { AdminSalesInvoicesTab } from "@/components/admin/AdminSalesInvoicesTab";
import { AdminExpensesTab } from "@/components/admin/AdminExpensesTab";
import { AdminLeaguesTab } from "@/components/admin/AdminLeaguesTab";

import { AdminCouponsTab } from "@/components/admin/AdminCouponsTab";
import { AdminCoachingTab } from "@/components/admin/AdminCoachingTab";
import { AdminCorporateAccountsTab } from "@/components/admin/AdminCorporateAccountsTab";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopbar, getTabTitle } from "@/components/admin/AdminTopbar";
import { AdminCityProvider, useAdminCity } from "@/contexts/AdminCityContext";
import { useAdmin } from "@/hooks/useAdmin";
import { useAllCities } from "@/hooks/useBookings";

function ReportsExpenseWrapper() {
  const { selectedCity } = useAdminCity();
  const { isAdmin, assignedCities } = useAdmin();
  const { data: allCities } = useAllCities();
  const cities = isAdmin ? allCities : (allCities ?? []).filter((c) => assignedCities.includes(c));
  const effectiveCity = selectedCity || (cities && cities.length > 0 ? cities[0] : "");
  if (!effectiveCity) return null;
  return <ExpenseReports city={effectiveCity} />;
}

function ReportsPnlWrapper() {
  const { selectedCity } = useAdminCity();
  const { isAdmin, assignedCities } = useAdmin();
  const { data: allCities } = useAllCities();
  const cities = isAdmin ? allCities : (allCities ?? []).filter((c) => assignedCities.includes(c));
  const effectiveCity = selectedCity || (cities && cities.length > 0 ? cities[0] : "");
  if (!effectiveCity) return null;
  return <ProfitLossView city={effectiveCity} />;
}

function ReportsProfitabilityWrapper() {
  const { selectedCity } = useAdminCity();
  return <ProductProfitabilityReport city={selectedCity || undefined} />;
}

function ReportsGSTR1Wrapper() {
  const { selectedCity } = useAdminCity();
  const { isAdmin, assignedCities } = useAdmin();
  const { data: allCities } = useAllCities();
  const cities = isAdmin ? allCities : (allCities ?? []).filter((c) => assignedCities.includes(c));
  const effectiveCity = selectedCity || (cities && cities.length > 0 ? cities[0] : "");
  if (!effectiveCity) return null;
  return <GSTR1DownloadCard city={effectiveCity} />;
}

const tabComponents: Record<string, React.ComponentType<any>> = {
  dashboard: AdminDashboardTab,
  walkin: AdminWalkInBookingTab,
  events: AdminEventsTab,
  products: AdminProductsTab,
  salesinvoices: AdminSalesInvoicesTab,
  expenses: AdminExpensesTab,
  rewards: AdminRewardsTab,
  edgerewards: AdminEdgeRewardsTab,
  leagues: AdminLeaguesTab,
  
  coaching: AdminCoachingTab,
  coupons: AdminCouponsTab,
  members: AdminMembersTab,
  allusers: AdminAllUsersTab,
  corporate: AdminCorporateAccountsTab,
  pages: AdminPagesTab,
  bayconfig: BayConfigTab,
  bookinglogs: AdminBookingLogsTab,
  payments: AdminPaymentsTab,
  pricing: AdminPricingTab,
  emails: AdminEmailLogsTab,
  reports_revenue: AdminRevenueTab,
  reports_expense_reports: ReportsExpenseWrapper,
  reports_pnl: ReportsPnlWrapper,
  reports_profitability: ReportsProfitabilityWrapper,
  reports_gstr1: ReportsGSTR1Wrapper,
  finance: AdminFinanceTab,
  settings: AdminSettingsTab,
};

export default function Admin() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin, isSiteAdmin, isCoach, isLeaguesOnly } = useAdmin();
  const coachOnly = !isAdmin && !isSiteAdmin && isCoach;
  const [activeTab, setActiveTab] = useState(() => {
    const urlTab = searchParams.get("tab");
    if (isLeaguesOnly) return "leagues";
    if (urlTab && tabComponents[urlTab]) return urlTab;
    return coachOnly ? "coaching" : "dashboard";
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Force leagues-only admins onto the leagues tab
  useEffect(() => {
    if (!isLeaguesOnly) return;
    if (activeTab !== "leagues") setActiveTab("leagues");
    if (searchParams.get("tab") !== "leagues") {
      setSearchParams({ tab: "leagues" }, { replace: true });
    }
  }, [isLeaguesOnly, activeTab, searchParams, setSearchParams]);

  // React to URL ?tab= changes (e.g. from notification clicks)
  useEffect(() => {
    if (isLeaguesOnly) return;
    const urlTab = searchParams.get("tab");
    if (urlTab && tabComponents[urlTab] && urlTab !== activeTab) {
      setActiveTab(urlTab);
    }
  }, [searchParams, isLeaguesOnly]);

  const ActiveComponent = tabComponents[activeTab] ?? AdminDashboardTab;

  return (
    <AdminCityProvider>
      <div className="flex min-h-screen bg-muted/40">
        <AdminSidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        />

        <div className="flex flex-1 flex-col min-w-0">
          <AdminTopbar
            title={getTabTitle(activeTab)}
            onMenuClick={() => setSidebarOpen(true)}
            onSettingsClick={() => setActiveTab("settings")}
          />

          <main className="flex-1 p-4 md:p-6">
            {activeTab === "dashboard" ? (
              <AdminDashboardTab onNavigate={setActiveTab} />
            ) : (
              <ActiveComponent />
            )}
          </main>
        </div>
      </div>
    </AdminCityProvider>
  );
}
