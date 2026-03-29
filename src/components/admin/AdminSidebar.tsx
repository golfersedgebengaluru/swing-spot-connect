import { useState } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  MapPin,
  Gift,
  ShoppingBag,
  ClipboardList,
  CreditCard,
  Mail,
  Award,
  BarChart3,
  ChevronRight,
  PanelLeftClose,
  X,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
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
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "walkin", label: "Walk-in Booking", icon: CalendarDays },
  { id: "bookinglogs", label: "Bookings", icon: CalendarDays },
  { id: "members", label: "Members", icon: Users },
  { id: "bayconfig", label: "Bays", icon: MapPin },
  { id: "rewards", label: "Rewards", icon: Gift },
];

const operationsItems = [
  { id: "products", label: "Products", icon: ShoppingBag },
  { id: "orders", label: "Orders", icon: ClipboardList },
  { id: "finance", label: "Finance", icon: Receipt },
];

const configItems = [
  { id: "pricing", label: "Pricing", icon: CreditCard },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "emails", label: "Emails", icon: Mail },
  { id: "settings", label: "Settings", icon: Award },
];

const reportsItems = [
  { id: "revenue", label: "Revenue", icon: BarChart3 },
  { id: "allusers", label: "All Users", icon: BarChart3 },
  { id: "pages", label: "Pages", icon: BarChart3 },
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
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-normal transition-colors min-h-[44px]",
        active
          ? "bg-muted text-foreground font-medium"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
      <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 min-h-[44px]">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
          {label}
        </span>
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
            open && "rotate-90"
          )}
        />
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
  const { user } = useAuth();
  const initials = user?.email
    ? user.email.substring(0, 2).toUpperCase()
    : "AD";

  const handleNavClick = (tab: string) => {
    onTabChange(tab);
    // Close overlay on mobile
    if (window.innerWidth < 1024) {
      onClose();
    }
  };

  const sidebarWidth = collapsed ? "w-14" : "w-[220px]";

  const sidebarContent = (
    <div className="flex h-full flex-col bg-background border-r border-border/50">
      {/* Header */}
      <div className="flex h-[52px] items-center justify-between px-3 border-b border-border/50">
        {!collapsed && (
          <span className="text-sm font-medium text-foreground truncate">
            Admin Panel
          </span>
        )}
        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground min-h-[44px] min-w-[44px]"
        >
          <PanelLeftClose className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
        </button>
        <button
          onClick={onClose}
          className="flex lg:hidden items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground min-h-[44px] min-w-[44px]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {/* Core items */}
        <div className="space-y-0.5">
          {coreItems.map((item) => (
            <NavItem
              key={item.id}
              item={item}
              active={activeTab === item.id}
              onClick={() => handleNavClick(item.id)}
              collapsed={collapsed}
            />
          ))}
        </div>

        <div className="border-b border-border/50 my-3" />

        {/* Accordion groups */}
        <AccordionGroup
          label="Operations"
          items={operationsItems}
          activeTab={activeTab}
          onTabChange={handleNavClick}
          collapsed={collapsed}
        />
        <AccordionGroup
          label="Config"
          items={configItems}
          activeTab={activeTab}
          onTabChange={handleNavClick}
          collapsed={collapsed}
        />
        <AccordionGroup
          label="Reports"
          items={reportsItems}
          activeTab={activeTab}
          onTabChange={handleNavClick}
          collapsed={collapsed}
        />
      </div>

      {/* Footer */}
      <div className="border-t border-border/50 px-3 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-800 text-xs font-medium">
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {user?.email?.split("@")[0] ?? "Admin"}
              </p>
              <p className="text-xs text-muted-foreground">Administrator</p>
            </div>
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
          "hidden lg:flex shrink-0 h-screen sticky top-0 transition-all duration-200",
          sidebarWidth
        )}
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-40 lg:hidden"
            onClick={onClose}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-[220px] lg:hidden">
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  );
}
