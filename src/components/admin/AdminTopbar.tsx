import { Menu, Search, Settings, LogOut, MapPin } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useAdminCity } from "@/contexts/AdminCityContext";

interface AdminTopbarProps {
  title: string;
  onMenuClick: () => void;
  onSettingsClick: () => void;
}

const tabTitles: Record<string, string> = {
  dashboard: "Dashboard",
  walkin: "Walk-in Booking",
  events: "Events",
  products: "Products",
  
  rewards: "Rewards",
  members: "Members",
  allusers: "All Users",
  pages: "Pages",
  bayconfig: "Bay Config",
  bookinglogs: "Bookings",
  payments: "Payments",
  pricing: "Pricing",
  emails: "Emails",
  salesinvoices: "Sales & Invoices",
  revenue: "Revenue & Reporting",
  finance: "Finance Settings",
  settings: "Settings",
};

export function getTabTitle(tab: string) {
  return tabTitles[tab] ?? "Admin";
}

export function AdminTopbar({ title, onMenuClick, onSettingsClick }: AdminTopbarProps) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { selectedCity, setSelectedCity, availableCities, isLoadingCities } = useAdminCity();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

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

      {/* City / Instance selector */}
      {!isLoadingCities && availableCities.length > 0 && (
        <div className="flex items-center gap-1.5 ml-2">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 hidden sm:block" />
          <Select value={selectedCity || "__all__"} onValueChange={(v) => setSelectedCity(v === "__all__" ? "" : v)}>
            <SelectTrigger className="h-8 w-[130px] sm:w-[160px] text-xs border-border/50 bg-muted/40">
              <SelectValue placeholder="All Cities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Cities (Global)</SelectItem>
              {availableCities.map((city) => (
                <SelectItem key={city} value={city}>{city}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

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

        <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" onClick={onSettingsClick}>
          <Settings className="h-4 w-4" />
          <span className="sr-only">Settings</span>
        </Button>

        <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px] text-muted-foreground hover:text-destructive" onClick={handleSignOut}>
          <LogOut className="h-4 w-4" />
          <span className="sr-only">Sign Out</span>
        </Button>
      </div>
    </header>
  );
}
