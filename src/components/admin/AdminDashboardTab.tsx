import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, Users, IndianRupee, Clock, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth } from "date-fns";

function useAdminDashboardStats() {
  return useQuery({
    queryKey: ["admin-dashboard-stats"],
    queryFn: async () => {
      const now = new Date();
      const monthStart = startOfMonth(now).toISOString();
      const monthEnd = endOfMonth(now).toISOString();

      const [bookingsRes, membersRes, hoursRes] = await Promise.all([
        supabase
          .from("bookings")
          .select("id, status, start_time, end_time, bay_id, user_id, duration_minutes, session_type")
          .in("status", ["confirmed", "pending"])
          .gte("start_time", now.toISOString())
          .order("start_time", { ascending: true })
          .limit(5),
        supabase.from("profiles").select("id, display_name, email, points, tier, total_rounds, user_id"),
        supabase
          .from("hours_transactions")
          .select("hours, type")
          .gte("created_at", monthStart)
          .lte("created_at", monthEnd),
      ]);

      // Active bookings count (all confirmed today+)
      const { count: activeCount } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .in("status", ["confirmed", "pending"]);

      // Members count
      const { count: memberCount } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true });

      // Hours sold this month
      const hoursSold = (hoursRes.data ?? [])
        .filter((t) => t.type === "purchase")
        .reduce((sum, t) => sum + (t.hours ?? 0), 0);

      // Get bay names for bookings
      const bayIds = [...new Set((bookingsRes.data ?? []).map((b) => b.bay_id).filter(Boolean))];
      let baysMap: Record<string, string> = {};
      if (bayIds.length > 0) {
        const { data: bays } = await supabase.from("bays").select("id, name").in("id", bayIds);
        baysMap = Object.fromEntries((bays ?? []).map((b) => [b.id, b.name]));
      }

      // Get user names for bookings
      const userIds = [...new Set((bookingsRes.data ?? []).map((b) => b.user_id).filter(Boolean))];
      let usersMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, display_name, email")
          .in("user_id", userIds);
        usersMap = Object.fromEntries(
          (profiles ?? []).map((p) => [p.user_id!, p.display_name || p.email || "Unknown"])
        );
      }

      // Top members by points
      const topMembers = (membersRes.data ?? [])
        .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
        .slice(0, 5);

      return {
        activeBookings: activeCount ?? 0,
        memberCount: memberCount ?? 0,
        hoursSold,
        upcomingBookings: (bookingsRes.data ?? []).map((b) => ({
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

export function AdminDashboardTab() {
  const { data, isLoading } = useAdminDashboardStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stats = [
    {
      label: "Active bookings",
      value: data?.activeBookings ?? 0,
      sub: "",
      icon: CalendarDays,
    },
    {
      label: "Members",
      value: (data?.memberCount ?? 0).toLocaleString(),
      sub: "",
      icon: Users,
    },
    {
      label: "Revenue (month)",
      value: "—",
      sub: "",
      icon: IndianRupee,
    },
    {
      label: "Hours sold (month)",
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
        {/* Active & upcoming bookings */}
        <Card className="border border-border/50 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-medium">Active &amp; upcoming bookings</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-auto py-1">
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
                const timeStr = `${format(start, "HH:mm")}–${format(end, "HH:mm")}`;
                const isActive = b.status === "confirmed";
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
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      }`}
                    >
                      {isActive ? "Active" : "Upcoming"}
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
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-auto py-1">
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
