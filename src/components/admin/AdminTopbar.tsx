import { useState } from "react";
import { Menu, Search, Settings, LogOut, MapPin, User, Pencil, Check, X } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { PhoneInput } from "@/components/ui/phone-input";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useAdminCity } from "@/contexts/AdminCityContext";
import { useUserProfile, useCities } from "@/hooks/useBookings";
import { useAdmin } from "@/hooks/useAdmin";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

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

function AdminProfilePopover() {
  const { user } = useAuth();
  const { data: profile } = useUserProfile();
  const { data: cities } = useCities();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [preferredCity, setPreferredCity] = useState("");
  const [saving, setSaving] = useState(false);

  const initials = (profile?.display_name || user?.email || "A")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const startEditing = () => {
    setDisplayName(profile?.display_name || "");
    setPhone(profile?.phone || "");
    setPreferredCity(profile?.preferred_city || "");
    setEditing(true);
  };

  const cancelEditing = () => setEditing(false);

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName, phone, preferred_city: preferredCity })
      .eq("user_id", user.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Profile updated" });
      queryClient.invalidateQueries({ queryKey: ["user_profile"] });
      setEditing(false);
    }
    setSaving(false);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]">
          <Avatar className="h-7 w-7">
            <AvatarImage src={profile?.avatar_url || undefined} />
            <AvatarFallback className="text-xs bg-primary/10 text-primary font-medium">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-foreground">My Profile</h4>
            {!editing ? (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={startEditing}>
                <Pencil className="h-3 w-3 mr-1" /> Edit
              </Button>
            ) : (
              <div className="flex gap-1">
                <Button variant="default" size="sm" className="h-7 text-xs" onClick={saveProfile} disabled={saving}>
                  <Check className="h-3 w-3 mr-1" /> Save
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={cancelEditing}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 mb-4">
            <Avatar className="h-12 w-12">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="text-sm bg-primary/10 text-primary font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {profile?.display_name || "Admin"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {profile?.email || user?.email}
              </p>
            </div>
          </div>

          <Separator className="mb-3" />

          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Display Name</Label>
              {editing ? (
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1 h-8 text-sm"
                />
              ) : (
                <p className="text-sm text-foreground mt-0.5">{profile?.display_name || "Not set"}</p>
              )}
            </div>

            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Phone</Label>
              {editing ? (
                <div className="mt-1">
                  <PhoneInput value={phone} onChange={setPhone} />
                </div>
              ) : (
                <p className="text-sm text-foreground mt-0.5">{profile?.phone || "Not set"}</p>
              )}
            </div>

            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Preferred City</Label>
              {editing ? (
                <Select value={preferredCity} onValueChange={setPreferredCity}>
                  <SelectTrigger className="mt-1 h-8 text-sm">
                    <SelectValue placeholder="Select city" />
                  </SelectTrigger>
                  <SelectContent>
                    {(cities ?? []).map((city) => (
                      <SelectItem key={city} value={city}>{city}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-foreground mt-0.5">{profile?.preferred_city || "Not set"}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Tier</Label>
                <p className="text-sm text-foreground mt-0.5 capitalize">{profile?.tier || "Bronze"}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Membership</Label>
                <p className="text-sm text-foreground mt-0.5 capitalize">{profile?.user_type || "Registered"}</p>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
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

      {/* Right actions */}
      <div className="ml-auto flex items-center gap-1 sm:gap-2 shrink-0">
        <div className="relative hidden sm:block">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search"
            className="h-9 w-40 md:w-56 pl-8 text-sm rounded-md border-border/50 bg-muted/40"
          />
        </div>

        <NotificationBell />

        <AdminProfilePopover />

        <Button variant="ghost" size="icon" className="hidden sm:inline-flex min-h-[44px] min-w-[44px]" onClick={onSettingsClick}>
          <Settings className="h-4 w-4" />
          <span className="sr-only">Settings</span>
        </Button>

        <Button variant="ghost" size="icon" className="min-h-[36px] min-w-[36px] sm:min-h-[44px] sm:min-w-[44px] text-muted-foreground hover:text-destructive shrink-0" onClick={handleSignOut}>
          <LogOut className="h-4 w-4" />
          <span className="sr-only">Sign Out</span>
        </Button>
      </div>
    </header>
  );
}