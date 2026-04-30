import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  MapPin,
  Gift,
  ShoppingBag,
  Ticket,
  Trophy,
  CreditCard,
  Mail,
  Award,
  BarChart3,
  ChevronRight,
  PanelLeftClose,
  X,
  Receipt,
  LogOut,
  GraduationCap,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/useAdmin";
import { useSiteAdminPermissions } from "@/hooks/useSiteAdminPermissions";
import { useBranding } from "@/hooks/useBranding";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface AdminSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const coreItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, adminOrSiteAdminOnly: true },
  { id: "walkin", label: "Walk-in Booking", icon: CalendarDays, adminOrSiteAdminOnly: true },
  { id: "bookinglogs", label: "Bookings", icon: CalendarDays, adminOrSiteAdminOnly: true },
  { id: "leagues", label: "Leagues", icon: Trophy, adminOrSiteAdminOnly: true },
  { id: "coaching", label: "Coaching", icon: GraduationCap },
  { id: "edgerewards", label: "EDGE Rewards", icon: Award, adminOrSiteAdminOnly: true },
];

const usersItems = [
  { id: "allusers", label: "All Users", icon: Users },
  { id: "members", label: "Members", icon: Users },
];

const operationsItems = [
  { id: "salesinvoices", label: "Sales & Invoices", icon: Receipt },
  { id: "expenses", label: "Expenses", icon: Receipt },
  { id: "products", label: "Products", icon: ShoppingBag },
  { id: "coupons", label: "Coupons", icon: Ticket },
];

const configItems = [
  { id: "pricing", label: "Pricing", icon: CreditCard },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "emails", label: "Emails", icon: Mail },
  { id: "settings", label: "Settings", icon: Award, adminOnly: true },
  { id: "finance", label: "Finance Settings", icon: Receipt },
  { id: "bayconfig", label: "Locations", icon: MapPin },
  { id: "pages", label: "Page Settings", icon: BarChart3, adminOnly: true },
];

const reportsItems = [
  { id: "reports_revenue", label: "Revenue", icon: BarChart3 },
  { id: "reports_expense_reports", label: "Expense Reports", icon: BarChart3 },
  { id: "reports_pnl", label: "P&L", icon: BarChart3 },
  { id: "reports_profitability", label: "Product Profitability", icon: BarChart3 },
  { id: "reports_gstr1", label: "GSTR-1", icon: BarChart3 },
];

function NavItem({
  item,
  active,
  onClick,
  collapsed,
}: {
  item: { id: string; label: string; icon: React.ElementType };
  active: boolean;
  onClick: () => void;
  collapsed: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-normal transition-colors min-h-[44px] touch-manipulation",
        active
          ? "bg-white/[0.12] text-white font-medium border-r-2 border-[hsl(var(--admin-gold))]"
          : "text-white/60 hover:bg-white/[0.08] hover:text-white/90"
      )}
      title={collapsed ? item.label : undefined}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </button>
  );
}

function AccordionGroup({
  label,
  items,
  activeTab,
  onTabChange,
  collapsed,
}: {
  label: string;
  items: typeof coreItems;
  activeTab: string;
  onTabChange: (tab: string) => void;
  collapsed: boolean;
}) {
  const hasActive = items.some((i) => i.id === activeTab);
  const [open, setOpen] = useState(hasActive);

  if (collapsed) {
    return (
      <div className="space-y-0.5">
        {items.map((item) => (
          <NavItem
            key={item.id}
            item={item}
            active={activeTab === item.id}
            onClick={() => onTabChange(item.id)}
            collapsed
          />
        ))}
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 min-h-[44px] touch-manipulation"
        >
          <span className="text-xs text-white/30 font-medium uppercase tracking-wide">
            {label}
          </span>
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 text-white/30 transition-transform duration-200",
              open && "rotate-90"
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-0.5 pb-1">
          {items.map((item) => (
            <NavItem
              key={item.id}
              item={item}
              active={activeTab === item.id}
              onClick={() => onTabChange(item.id)}
              collapsed={false}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function AdminSidebar({
  activeTab,
  onTabChange,
  open,
  onClose,
  collapsed,
  onToggleCollapse,
}: AdminSidebarProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { role, isAdmin, isSiteAdmin } = useAdmin();
  const { data: permissions } = useSiteAdminPermissions();
  const { data: branding } = useBranding();
  const studioName = branding?.studio_name || "Admin";
  const initials = user?.email
    ? user.email.substring(0, 2).toUpperCase()
    : "AD";
  const roleLabel = role === "admin" ? "Administrator" : role === "site_admin" ? "Site-Admin" : "Coach";
  const hasAdminOrSiteAdmin = isAdmin || isSiteAdmin;

  const visibleReportsItems = reportsItems.filter((item) => {
    if (isAdmin) return true;
    if (!isSiteAdmin) return false;
    if (item.id === "reports_revenue") return true;
    if (item.id === "reports_expense_reports") return permissions?.site_admin_expense_reports_visible;
    if (item.id === "reports_pnl") return permissions?.site_admin_pnl_visible;
    if (item.id === "reports_profitability") return permissions?.site_admin_product_profitability_visible;
    if (item.id === "reports_gstr1") return true;
    return false;
  });

  const filterItems = (items: typeof coreItems) =>
    items.filter((i) => {
      if ((i as any).adminOnly && !isAdmin) return false;
      if ((i as any).adminOrSiteAdminOnly && !hasAdminOrSiteAdmin) return false;
      return true;
    });

  const handleNavClick = (tab: string) => {
    onTabChange(tab);
    // Close overlay on mobile
    if (window.innerWidth < 1024) {
      onClose();
    }
  };

  const sidebarWidth = collapsed ? "w-14 max-w-14" : "w-[220px] max-w-[220px]";

  const sidebarContent = (
    <div className="flex h-full flex-col overflow-hidden bg-[hsl(var(--sidebar-background))]">
      {/* Header */}
      <div className="flex h-[52px] items-center justify-between px-3 border-b border-white/10">
        {!collapsed && (
          <span className="text-sm font-medium text-white truncate font-display">
            {studioName}
          </span>
        )}
        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex items-center justify-center rounded-md p-1.5 text-white/50 hover:bg-white/[0.08] hover:text-white min-h-[44px] min-w-[44px]"
        >
          <PanelLeftClose className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
        </button>
        <button
          onClick={onClose}
          className="flex lg:hidden items-center justify-center rounded-md p-1.5 text-white/50 hover:bg-white/[0.08] hover:text-white min-h-[44px] min-w-[44px]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {/* Core items */}
        <div className="space-y-0.5">
          {filterItems(coreItems).map((item) => (
            <NavItem
              key={item.id}
              item={item}
              active={activeTab === item.id}
              onClick={() => handleNavClick(item.id)}
              collapsed={collapsed}
            />
          ))}
        </div>

        {hasAdminOrSiteAdmin && <div className="border-b border-white/10 my-3" />}

        {/* Accordion groups (admin & site-admin only) */}
        {hasAdminOrSiteAdmin && (
          <>
            <AccordionGroup label="Users" items={filterItems(usersItems)} activeTab={activeTab} onTabChange={handleNavClick} collapsed={collapsed} />
            <AccordionGroup label="Operations" items={filterItems(operationsItems)} activeTab={activeTab} onTabChange={handleNavClick} collapsed={collapsed} />
            <AccordionGroup label="Config" items={filterItems(configItems)} activeTab={activeTab} onTabChange={handleNavClick} collapsed={collapsed} />
            {visibleReportsItems.length > 0 && (
              <AccordionGroup label="Reports" items={visibleReportsItems} activeTab={activeTab} onTabChange={handleNavClick} collapsed={collapsed} />
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-white/10 px-3 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--admin-gold))] text-[hsl(var(--sidebar-background))] text-xs font-semibold">
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">
                {user?.email?.split("@")[0] ?? "Admin"}
              </p>
              <p className="text-xs text-white/40">{roleLabel}</p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={async () => { await signOut(); navigate("/auth"); }}
              className="flex items-center justify-center rounded-md p-1.5 text-white/50 hover:bg-white/[0.08] hover:text-destructive min-h-[36px] min-w-[36px]"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex shrink-0 h-screen sticky top-0 transition-all duration-200 overflow-hidden",
          sidebarWidth
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-40 lg:hidden touch-manipulation"
            onClick={onClose}
            onTouchEnd={(e) => { e.preventDefault(); onClose(); }}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-[220px] lg:hidden">
            {/* Mobile overlay always renders expanded (non-collapsed) sidebar */}
            <div className="flex h-full flex-col bg-[hsl(var(--sidebar-background))]">
              {/* Header */}
              <div className="flex h-[52px] items-center justify-between px-3 border-b border-white/10">
                <span className="text-sm font-medium text-white truncate font-display">
                  {studioName}
                </span>
                <button
                  onClick={onClose}
                  className="flex lg:hidden items-center justify-center rounded-md p-1.5 text-white/50 hover:bg-white/[0.08] hover:text-white min-h-[44px] min-w-[44px]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Nav */}
              <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1 [-webkit-overflow-scrolling:touch]">
                <div className="space-y-0.5">
                  {filterItems(coreItems).map((item) => (
                    <NavItem
                      key={item.id}
                      item={item}
                      active={activeTab === item.id}
                      onClick={() => handleNavClick(item.id)}
                      collapsed={false}
                    />
                  ))}
                </div>
                {hasAdminOrSiteAdmin && <div className="border-b border-white/10 my-3" />}
                {hasAdminOrSiteAdmin && (
                  <>
                    <AccordionGroup label="Users" items={filterItems(usersItems)} activeTab={activeTab} onTabChange={handleNavClick} collapsed={false} />
                    <AccordionGroup label="Operations" items={filterItems(operationsItems)} activeTab={activeTab} onTabChange={handleNavClick} collapsed={false} />
                    <AccordionGroup label="Config" items={filterItems(configItems)} activeTab={activeTab} onTabChange={handleNavClick} collapsed={false} />
                    {visibleReportsItems.length > 0 && (
                      <AccordionGroup label="Reports" items={visibleReportsItems} activeTab={activeTab} onTabChange={handleNavClick} collapsed={false} />
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-white/10 px-3 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--admin-gold))] text-[hsl(var(--sidebar-background))] text-xs font-semibold">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {user?.email?.split("@")[0] ?? "Admin"}
                    </p>
                    <p className="text-xs text-white/40">{roleLabel}</p>
                  </div>
                  <button
                    onClick={async () => { await signOut(); navigate("/auth"); }}
                    className="flex items-center justify-center rounded-md p-1.5 text-white/50 hover:bg-white/[0.08] hover:text-destructive min-h-[44px] min-w-[44px] touch-manipulation"
                    title="Sign Out"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
