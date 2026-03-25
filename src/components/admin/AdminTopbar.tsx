import { Menu, Search, Settings } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AdminTopbarProps {
  title: string;
  onMenuClick: () => void;
}

const tabTitles: Record<string, string> = {
  dashboard: "Dashboard",
  events: "Events",
  products: "Products",
  orders: "Orders",
  rewards: "Rewards",
  members: "Members",
  allusers: "All Users",
  pages: "Pages",
  bayconfig: "Bay Config",
  bookinglogs: "Bookings",
  payments: "Payments",
  pricing: "Pricing",
  emails: "Emails",
  revenue: "Revenue & Reporting",
  settings: "Settings",
};

export function getTabTitle(tab: string) {
  return tabTitles[tab] ?? "Admin";
}

export function AdminTopbar({ title, onMenuClick }: AdminTopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-[52px] items-center gap-3 border-b border-border/50 bg-background px-4">
      <button
        onClick={onMenuClick}
        className="flex lg:hidden items-center justify-center rounded-md border border-border/50 p-2 text-muted-foreground hover:bg-muted hover:text-foreground min-h-[44px] min-w-[44px]"
        aria-label="Toggle menu"
      >
        <Menu className="h-4 w-4" />
      </button>

      <h1 className="text-sm font-medium text-foreground truncate max-w-[140px] sm:max-w-none">
        {title}
      </h1>

      {/* Search bar */}
      <div className="ml-auto flex items-center gap-2">
        <div className="relative hidden sm:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search"
            className="h-9 w-40 md:w-56 pl-8 text-sm rounded-md border-border/50 bg-muted/40"
          />
        </div>
        <Button variant="ghost" size="icon" className="sm:hidden min-h-[44px] min-w-[44px]">
          <Search className="h-4 w-4" />
        </Button>

        <NotificationBell />

        <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]">
          <Settings className="h-4 w-4" />
          <span className="sr-only">Settings</span>
        </Button>
      </div>
    </header>
  );
}
