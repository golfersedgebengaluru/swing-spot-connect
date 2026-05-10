import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CalendarDays, Users, IndianRupee, Clock, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { useAdminCity } from "@/contexts/AdminCityContext";
import { useDefaultCurrency } from "@/hooks/useCurrency";
import { useAdmin } from "@/hooks/useAdmin";

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

      // Build all independent queries
      let totalBookingsQuery = supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("status", "confirmed")
        .gte("start_time", monthStart)
        .lte("start_time", monthEnd);
      if (cityFilter) totalBookingsQuery = totalBookingsQuery.eq("city", cityFilter);

      let membersQuery = supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .in("user_type", ["birdie", "coaching"]);
      if (cityFilter) membersQuery = membersQuery.eq("preferred_city", cityFilter);

      let revenueQuery = supabase
        .from("revenue_transactions")
        .select("amount, transaction_type")
        .eq("status", "confirmed")
        .gte("created_at", monthStart)
        .lte("created_at", monthEnd);
      if (cityFilter) revenueQuery = revenueQuery.eq("city", cityFilter);

      let hoursQuery = supabase
        .from("bookings")
        .select("duration_minutes")
        .eq("status", "confirmed")
        .gte("start_time", monthStart)
        .lte("start_time", monthEnd);
      if (cityFilter) hoursQuery = hoursQuery.eq("city", cityFilter);

      let upcomingQuery = supabase
        .from("bookings")
        .select("id, status, start_time, end_time, bay_id, user_id, duration_minutes, session_type, city, invoice_id, corporate_invoice_id")
        .eq("status", "confirmed")
        .gte("start_time", now.toISOString())
        .order("start_time", { ascending: true })
        .limit(5);
      if (cityFilter) upcomingQuery = upcomingQuery.eq("city", cityFilter);

      let topQuery = supabase
        .from("profiles")
        .select("id, display_name, email, points, tier, total_rounds, user_id, preferred_city")
        .in("user_type", ["birdie", "coaching"])
        .order("points", { ascending: false })
        .limit(5);
      if (cityFilter) topQuery = topQuery.eq("preferred_city", cityFilter);

      // Execute ALL independent queries in parallel
      const [
        { count: totalBookings },
        { count: memberCount },
        { data: revData },
        { data: hoursData },
        { data: bookingsData },
        { data: topMembers },
      ] = await Promise.all([
        totalBookingsQuery,
        membersQuery,
        revenueQuery,
        hoursQuery,
        upcomingQuery,
        topQuery,
      ]);

      const revenue = (revData ?? []).reduce((sum, t) => {
        if (t.transaction_type === "refund") return sum - (t.amount ?? 0);
        return sum + (t.amount ?? 0);
      }, 0);

      const hoursSold = (hoursData ?? []).reduce(
        (sum, b) => sum + (b.duration_minutes ?? 0),
        0
      ) / 60;

      // Resolve bay names and user profiles (dependent on bookingsData).
      // NOTE: bookings.user_id may hold either profiles.user_id (auth members)
      // OR profiles.id (admin-created profile-only members). Dual-key lookup.
      const bayIds = [...new Set((bookingsData ?? []).map((b) => b.bay_id).filter(Boolean))];
      const userKeys = [...new Set((bookingsData ?? []).map((b) => b.user_id).filter(Boolean))];

      type ProfileInfo = { name: string; user_type: string | null; corporate_account_id: string | null };

      const [baysMap, profilesMap] = await Promise.all([
        bayIds.length > 0
          ? supabase.from("bays").select("id, name").in("id", bayIds).then(({ data }) =>
              Object.fromEntries((data ?? []).map((b) => [b.id, b.name]))
            )
          : Promise.resolve({} as Record<string, string>),
        userKeys.length > 0
          ? Promise.all([
              supabase.from("profiles")
                .select("id, user_id, display_name, email, user_type, corporate_account_id")
                .in("user_id", userKeys),
              supabase.from("profiles")
                .select("id, user_id, display_name, email, user_type, corporate_account_id")
                .in("id", userKeys),
            ]).then(([{ data: byUid }, { data: byId }]) => {
              const m: Record<string, ProfileInfo> = {};
              const toInfo = (p: any): ProfileInfo => ({
                name: p.display_name || p.email || "Unknown",
                user_type: p.user_type ?? null,
                corporate_account_id: p.corporate_account_id ?? null,
              });
              for (const p of byUid ?? []) if (p.user_id) m[p.user_id] = toInfo(p);
              for (const p of byId ?? []) if (!m[p.id]) m[p.id] = toInfo(p);
              return m;
            })
          : Promise.resolve({} as Record<string, ProfileInfo>),
      ]);

      // Resolve corporate account names
      const corporateIds = [
        ...new Set(Object.values(profilesMap).map((p) => p.corporate_account_id).filter(Boolean) as string[]),
      ];
      const corporateMap: Record<string, string> = corporateIds.length > 0
        ? await supabase.from("corporate_accounts").select("id, name").in("id", corporateIds).then(({ data }) =>
            Object.fromEntries((data ?? []).map((c: any) => [c.id, c.name]))
          )
        : {};

      return {
        totalBookings: totalBookings ?? 0,
        memberCount: memberCount ?? 0,
        revenue,
        hoursSold,
        upcomingBookings: (bookingsData ?? []).map((b) => {
          const profile = profilesMap[b.user_id];
          const corporateName = profile?.corporate_account_id
            ? corporateMap[profile.corporate_account_id] ?? null
            : null;
          // "Hours" tag: member (birdie/coaching) + practice session + no invoice + no corporate
          const isMember = profile?.user_type === "birdie" || profile?.user_type === "coaching";
          const isCoaching = b.session_type === "coaching";
          const isCorporate = !!corporateName || !!b.corporate_invoice_id;
          const usingHours = isMember && !isCoaching && !isCorporate && !b.invoice_id;
          return {
            ...b,
            bayName: b.bay_id ? baysMap[b.bay_id] ?? "Bay" : "Bay",
            userName: profile?.name ?? "Unknown",
            corporateName,
            isCoaching,
            isCorporate,
            usingHours,
          };
        }),
        topMembers: topMembers ?? [],
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
  const { format: formatAmount } = useDefaultCurrency();
  const { isAdmin } = useAdmin();

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
    ...(isAdmin
      ? [
          {
            label: "Revenue (month)",
            value: formatAmount(data?.revenue ?? 0),
            sub: "",
            icon: IndianRupee,
          },
        ]
      : []),
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
        {stats.map((s) => {
          const isRevenue = s.label === "Revenue (month)";
          const isHours = s.label === "Hours booked (month)";
          return (
            <div
              key={s.label}
              className={cn(
                "rounded-xl p-4 space-y-1 border",
                isRevenue
                  ? "bg-[hsl(var(--sidebar-background))] border-transparent"
                  : "bg-white border-[hsl(0_0%_92%)]"
              )}
            >
              <p className={cn("text-xs font-normal", isRevenue ? "text-white/45" : "text-muted-foreground")}>{s.label}</p>
              <p className={cn(
                "text-2xl font-medium leading-tight",
                isRevenue ? "text-white" : isHours ? "text-[hsl(var(--admin-gold-dark))]" : "text-foreground"
              )}>{s.value}</p>
              {s.sub && <p className={cn("text-xs", isRevenue ? "text-white/45" : "text-primary")}>{s.sub}</p>}
            </div>
          );
        })}
      </div>

      {/* Two column: bookings + top members */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Upcoming bookings */}
        <Card className="border border-[hsl(0_0%_92%)] shadow-none rounded-xl bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-display font-medium text-[hsl(0_0%_13%)]">Upcoming bookings</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-[hsl(var(--admin-gold))] hover:text-[hsl(var(--admin-gold-dark))] h-auto py-1"
              onClick={() => onNavigate?.("bookinglogs")}
            >
              View all →
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
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium text-foreground truncate">{b.userName}</p>
                        {b.isCoaching && (
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-700">
                            Coaching
                          </span>
                        )}
                        {b.isCorporate && (
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700">
                            {b.corporateName ? `Corporate · ${b.corporateName}` : "Corporate"}
                          </span>
                        )}
                        {b.usingHours && (
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700">
                            Hours
                          </span>
                        )}
                      </div>
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
        <Card className="border border-[hsl(0_0%_92%)] shadow-none rounded-xl bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-display font-medium text-[hsl(0_0%_13%)]">Top members</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-[hsl(var(--admin-gold))] hover:text-[hsl(var(--admin-gold-dark))] h-auto py-1"
              onClick={() => onNavigate?.("members")}
            >
              View all →
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
                    <p className="text-sm font-medium text-[hsl(var(--admin-gold))]">
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
