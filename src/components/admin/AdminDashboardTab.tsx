import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, Users, IndianRupee, Clock, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { useAdminCity } from "@/contexts/AdminCityContext";
import { useDefaultCurrency } from "@/hooks/useCurrency";

interface AdminDashboardTabProps {
  onNavigate?: (tab: string) => void;
}

function useAdminDashboardStats(cityFilter: string) {
  return useQuery({
    queryKey: ["admin-dashboard-stats", cityFilter],
    queryFn: async () => {
      const now = new Date();
      const monthStart = startOfMonth(now).toISOString();
      const monthEnd = endOfMonth(now).toISOString();

      // --- Total confirmed bookings this month ---
      let totalBookingsQuery = supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("status", "confirmed")
        .gte("start_time", monthStart)
        .lte("start_time", monthEnd);
      if (cityFilter) totalBookingsQuery = totalBookingsQuery.eq("city", cityFilter);
      const { count: totalBookings } = await totalBookingsQuery;

      // --- Members count (birdie + coaching only) ---
      let membersQuery = supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .in("user_type", ["birdie", "coaching"]);
      if (cityFilter) membersQuery = membersQuery.eq("preferred_city", cityFilter);
      const { count: memberCount } = await membersQuery;

      // --- Revenue this month (from revenue_transactions) ---
      let revenueQuery = supabase
        .from("revenue_transactions")
        .select("amount, transaction_type")
        .eq("status", "confirmed")
        .gte("created_at", monthStart)
        .lte("created_at", monthEnd);
      if (cityFilter) revenueQuery = revenueQuery.eq("city", cityFilter);
      const { data: revData } = await revenueQuery;

      const revenue = (revData ?? []).reduce((sum, t) => {
        if (t.transaction_type === "refund") return sum - (t.amount ?? 0);
        return sum + (t.amount ?? 0);
      }, 0);

      // --- Hours sold this month (from confirmed bookings) ---
      let hoursQuery = supabase
        .from("bookings")
        .select("duration_minutes")
        .eq("status", "confirmed")
        .gte("start_time", monthStart)
        .lte("start_time", monthEnd);
      if (cityFilter) hoursQuery = hoursQuery.eq("city", cityFilter);
      const { data: hoursData } = await hoursQuery;

      const hoursSold = (hoursData ?? []).reduce(
        (sum, b) => sum + (b.duration_minutes ?? 0),
        0
      ) / 60;

      // --- Upcoming 5 confirmed bookings ---
      let upcomingQuery = supabase
        .from("bookings")
        .select("id, status, start_time, end_time, bay_id, user_id, duration_minutes, session_type, city")
        .eq("status", "confirmed")
        .gte("start_time", now.toISOString())
        .order("start_time", { ascending: true })
        .limit(5);
      if (cityFilter) upcomingQuery = upcomingQuery.eq("city", cityFilter);
      const { data: bookingsData } = await upcomingQuery;

      // Get bay names
      const bayIds = [...new Set((bookingsData ?? []).map((b) => b.bay_id).filter(Boolean))];
      let baysMap: Record<string, string> = {};
      if (bayIds.length > 0) {
        const { data: bays } = await supabase.from("bays").select("id, name").in("id", bayIds);
        baysMap = Object.fromEntries((bays ?? []).map((b) => [b.id, b.name]));
      }

      // Get user names
      const userIds = [...new Set((bookingsData ?? []).map((b) => b.user_id).filter(Boolean))];
      let usersMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, user_id, display_name, email");
        const dualMap = new Map<string, string>();
        for (const p of profiles ?? []) {
          const name = p.display_name || p.email || "Unknown";
          if (p.user_id) dualMap.set(p.user_id, name);
          dualMap.set(p.id, name);
        }
        usersMap = Object.fromEntries(
          userIds.map((uid) => [uid, dualMap.get(uid) || "Unknown"])
        );
      }

      // --- Top 5 members by points (birdie + coaching only) ---
      let topQuery = supabase
        .from("profiles")
        .select("id, display_name, email, points, tier, total_rounds, user_id, preferred_city")
        .in("user_type", ["birdie", "coaching"])
        .order("points", { ascending: false })
        .limit(50);
      if (cityFilter) topQuery = topQuery.eq("preferred_city", cityFilter);
      const { data: topData } = await topQuery;

      const topMembers = (topData ?? []).slice(0, 5);

      return {
        totalBookings: totalBookings ?? 0,
        memberCount: memberCount ?? 0,
        revenue,
        hoursSold,
        upcomingBookings: (bookingsData ?? []).map((b) => ({
          ...b,
          bayName: b.bay_id ? baysMap[b.bay_id] ?? "Bay" : "Bay",
          userName: usersMap[b.user_id] ?? "Unknown",
        })),
        topMembers,
      };
    },
    refetchInterval: 30000,
  });
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getBayShort(name: string) {
  const match = name.match(/\d+/);
  return match ? `B${match[0]}` : name.slice(0, 2).toUpperCase();
}

export function AdminDashboardTab({ onNavigate }: AdminDashboardTabProps = {}) {
  const { selectedCity } = useAdminCity();
  const { data, isLoading } = useAdminDashboardStats(selectedCity);
  const { formatAmount } = useCurrency();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stats = [
    {
      label: "Total bookings",
      value: data?.totalBookings ?? 0,
      sub: "this month",
      icon: CalendarDays,
    },
    {
      label: "Members",
      value: (data?.memberCount ?? 0).toLocaleString(),
      sub: "birdie & coaching",
      icon: Users,
    },
    {
      label: "Revenue (month)",
      value: formatAmount(data?.revenue ?? 0),
      sub: "",
      icon: IndianRupee,
    },
    {
      label: "Hours booked (month)",
      value: data?.hoursSold ?? 0,
      sub: "",
      icon: Clock,
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-lg bg-muted/60 p-4 space-y-1"
          >
            <p className="text-xs text-muted-foreground font-normal">{s.label}</p>
            <p className="text-2xl font-medium text-foreground leading-tight">{s.value}</p>
            {s.sub && <p className="text-xs text-primary">{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* Two column: bookings + top members */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Upcoming bookings */}
        <Card className="border border-border/50 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-medium">Upcoming bookings</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground h-auto py-1"
              onClick={() => onNavigate?.("bookinglogs")}
            >
              View all
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {(data?.upcomingBookings ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No upcoming bookings</p>
            ) : (
              (data?.upcomingBookings ?? []).map((b) => {
                const start = new Date(b.start_time);
                const end = new Date(b.end_time);
                const dateStr = format(start, "dd MMM");
                const timeStr = `${dateStr} · ${format(start, "HH:mm")}–${format(end, "HH:mm")}`;
                return (
                  <div
                    key={b.id}
                    className="flex items-center gap-3 rounded-lg border border-border/40 px-3 py-2.5"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                      {getBayShort(b.bayName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{b.userName}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.bayName} · {timeStr}
                      </p>
                    </div>
                    <span className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                      Confirmed
                    </span>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Top members */}
        <Card className="border border-border/50 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-medium">Top members</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground h-auto py-1"
              onClick={() => onNavigate?.("members")}
            >
              View all
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {(data?.topMembers ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No members yet</p>
            ) : (
              (data?.topMembers ?? []).map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-lg border border-border/40 px-3 py-2.5"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
                    {getInitials(m.display_name || m.email || "?")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {m.display_name || m.email || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.tier ?? "Member"} · {m.total_rounds ?? 0} visits
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-foreground">
                      {(m.points ?? 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">pts</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
