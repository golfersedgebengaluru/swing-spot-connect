import { Menu } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";

interface AdminTopbarProps {
  title: string;
  onMenuClick: () => void;
}

const tabTitles: Record<string, string> = {
  events: "Dashboard",
  products: "Products",
  orders: "Orders",
  rewards: "Rewards",
  members: "Members",
  allusers: "All Users",
  pages: "Pages",
  bayconfig: "Bay Config",
  bookinglogs: "Bookings",
  payments: "Payments",
  emails: "Emails",
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

      <div className="ml-auto flex items-center gap-2">
        <NotificationBell />
      </div>
    </header>
  );
}
