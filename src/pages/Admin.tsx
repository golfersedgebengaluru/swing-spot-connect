import { useState } from "react";
import { AdminDashboardTab } from "@/components/admin/AdminDashboardTab";
import { AdminEventsTab } from "@/components/admin/AdminEventsTab";
import { AdminProductsTab } from "@/components/admin/AdminProductsTab";
import { AdminRewardsTab } from "@/components/admin/AdminRewardsTab";
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
import { AdminWalkInBookingTab } from "@/components/admin/AdminWalkInBookingTab";
import { AdminFinanceTab } from "@/components/admin/AdminFinanceTab";
import { AdminSalesInvoicesTab } from "@/components/admin/AdminSalesInvoicesTab";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopbar, getTabTitle } from "@/components/admin/AdminTopbar";

const tabComponents: Record<string, React.ComponentType> = {
  dashboard: AdminDashboardTab,
  walkin: AdminWalkInBookingTab,
  events: AdminEventsTab,
  products: AdminProductsTab,
  
  salesinvoices: AdminSalesInvoicesTab,
  rewards: AdminRewardsTab,
  members: AdminMembersTab,
  allusers: AdminAllUsersTab,
  pages: AdminPagesTab,
  bayconfig: BayConfigTab,
  bookinglogs: AdminBookingLogsTab,
  payments: AdminPaymentsTab,
  pricing: AdminPricingTab,
  emails: AdminEmailLogsTab,
  revenue: AdminRevenueTab,
  finance: AdminFinanceTab,
  settings: AdminSettingsTab,
};

export default function Admin() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const ActiveComponent = tabComponents[activeTab] ?? AdminDashboardTab;

  return (
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
          <ActiveComponent />
        </main>
      </div>
    </div>
  );
}
