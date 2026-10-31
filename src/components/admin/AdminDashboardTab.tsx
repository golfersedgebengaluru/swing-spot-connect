import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CalendarDays, Users, IndianRupee, Clock, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { zonedMonthRangeUtc, zonedMonthDays } from "@/lib/report-period";
import { fetchAllPaged } from "@/lib/supabase-paging";
import { useAdminCity } from "@/contexts/AdminCityContext";
import { useDefaultCurrency } from "@/hooks/useCurrency";
import { useAdmin } from "@/hooks/useAdmin";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { parseDashboardAttention } from "@/lib/dashboard-attention";

interface AdminDashboardTabProps {
  onNavigate?: (tab: string) => void;
}

function useAdminDashboardStats(cityFilter: string) {
  const { user } = useAuth();
  const { hasAdminAccess, loading } = useAdmin();
  return useQuery({
    queryKey: ["admin-dashboard-stats", user?.id, cityFilter],
    enabled: hasAdminAccess && !loading,
    queryFn: async () => {
      const now = new Date();
      // Business-month boundaries (half-open) shared with the revenue reports,
      // so the MTD tiles agree with the revenue tab to the rupee.
      const { fromUtc: monthStart, toExclusiveUtc: monthEndExclusive } = zonedMonthRangeUtc(now);
      // Revenue is counted on its business date (invoice date when invoiced),
      // so the MTD money tile filters the `revenue_date` column, not created_at.
      const { fromDay: monthFromDay, toDay: monthToDay } = zonedMonthDays(now);

      // Build all independent queries
      let totalBookingsQuery = supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("status", "confirmed")
        .gte("start_time", monthStart)
        .lt("start_time", monthEndExclusive);
      if (cityFilter) totalBookingsQuery = totalBookingsQuery.eq("city", cityFilter);

      let membersQuery = supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .in("user_type", ["birdie", "coaching"]);
      if (cityFilter) membersQuery = membersQuery.eq("preferred_city", cityFilter);

      // Paged: MTD totals must cover every row, not the first 1000.
      const revenueRows = fetchAllPaged<any>((from, to) => {
        let q = supabase
          .from("revenue_transactions")
          .select("amount, transaction_type")
          .eq("status", "confirmed")
          .gte("revenue_date", monthFromDay)
          .lte("revenue_date", monthToDay)
          .order("revenue_date", { ascending: true });
        if (cityFilter) q = q.eq("city", cityFilter);
        return q.range(from, to);
      });

      const hoursRows = fetchAllPaged<any>((from, to) => {
        let q = supabase
          .from("bookings")
          .select("duration_minutes")
          .eq("status", "confirmed")
          .gte("start_time", monthStart)
          .lt("start_time", monthEndExclusive)
          .order("start_time", { ascending: true });
        if (cityFilter) q = q.eq("city", cityFilter);
        return q.range(from, to);
      });


      let upcomingQuery = supabase
        .from("bookings")
        .select("id, status, start_time, end_time, bay_id, user_id, duration_minutes, session_type, city, invoice_id, corporate_invoice_id, corporate_account_id")
        .eq("status", "confirmed")
        .gte("start_time", now.toISOString())
        .order("start_time", { ascending: true })
        .order("id", { ascending: true })
        .limit(5);
      if (cityFilter) upcomingQuery = upcomingQuery.eq("city", cityFilter);

      const attentionQuery = supabase.rpc("customer_report", {
        _city: cityFilter || undefined, _preset: "dashboard", _limit: 1, _as_of: now.toISOString(),
      }).then(({ data: result, error }) => {
        if (error) throw error;
        return parseDashboardAttention(result);
      });

      // Execute ALL independent queries in parallel
      const [
        { count: totalBookings },
        { count: memberCount },
        revData,
        hoursData,
        { data: bookingsData },
        attention,
      ] = await Promise.all([
        totalBookingsQuery,
        membersQuery,
        revenueRows,
        hoursRows,
        upcomingQuery,
        attentionQuery,
      ]);

      // Net revenue. Refunds are stored negative, so they subtract themselves;
      // legacy rows stored positive are normalised here so old months still net
      // out correctly.
      const revenue = revData.reduce((sum: number, t: any) => {
        const amount = Number(t.amount ?? 0);
        if (t.transaction_type === "refund") return sum - Math.abs(amount);
        return sum + amount;
      }, 0);

      const hoursSold = hoursData.reduce(
        (sum: number, b: any) => sum + (b.duration_minutes ?? 0),
        0
      ) / 60;


      // Resolve bay names and user profiles (dependent on bookingsData).
      // NOTE: bookings.user_id may hold either profiles.user_id (auth members)
      // OR profiles.id (admin-created profile-only members). Dual-key lookup.
      const bayIds = [...new Set((bookingsData ?? []).map((b) => b.bay_id).filter(Boolean))];
      const userKeys = [...new Set((bookingsData ?? []).map((b) => b.user_id).filter(Boolean))];

      type ProfileInfo = { name: string; user_type: string | null };

      const [baysMap, profilesMap] = await Promise.all([
        bayIds.length > 0
          ? supabase.from("bays").select("id, name").in("id", bayIds).then(({ data }) =>
              Object.fromEntries((data ?? []).map((b) => [b.id, b.name]))
            )
          : Promise.resolve({} as Record<string, string>),
        userKeys.length > 0
          ? Promise.all([
              supabase.from("profiles")
                .select("id, user_id, display_name, email, user_type")
                .in("user_id", userKeys),
              supabase.from("profiles")
                .select("id, user_id, display_name, email, user_type")
                .in("id", userKeys),
            ]).then(([{ data: byUid }, { data: byId }]) => {
              const m: Record<string, ProfileInfo> = {};
              const toInfo = (p: any): ProfileInfo => ({
                name: p.display_name || p.email || "Unknown",
                user_type: p.user_type ?? null,
              });
              for (const p of byUid ?? []) if (p.user_id) m[p.user_id] = toInfo(p);
              for (const p of byId ?? []) if (!m[p.id]) m[p.id] = toInfo(p);
              return m;
            })
          : Promise.resolve({} as Record<string, ProfileInfo>),
      ]);

      // Resolve corporate account names
      const corporateIds = [
        ...new Set((bookingsData ?? []).map(b => b.corporate_account_id).filter(Boolean) as string[]),
      ];
      const corporateMap: Record<string, string> = corporateIds.length > 0
        ? await supabase.from("corporate_accounts").select("id, name, nickname").in("id", corporateIds).then(({ data }) =>
            Object.fromEntries((data ?? []).map((c: any) => [c.id, (c.nickname && c.nickname.trim()) || c.name]))
          )
        : {};

      return {
        totalBookings: totalBookings ?? 0,
        memberCount: memberCount ?? 0,
        revenue,
        hoursSold,
        upcomingBookings: (bookingsData ?? []).map((b) => {
          const profile = profilesMap[b.user_id];
          const corporateName = b.corporate_account_id
            ? corporateMap[b.corporate_account_id] ?? null
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
            firstVisitHere: attention.first_visits.includes(b.id),
          };
        }),
        attention,
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
  const { data, isLoading, error, refetch } = useAdminDashboardStats(selectedCity);
  const navigate = useNavigate();
  const [attentionView, setAttentionView] = useState("renewals");
  const { format: formatAmount } = useDefaultCurrency();
  const { isAdmin } = useAdmin();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) return <div role="alert" className="py-8 text-center space-y-3"><p className="text-sm text-destructive">Dashboard unavailable. Please try again.</p><Button variant="outline" onClick={() => void refetch()}>Retry</Button></div>;
  const attentionRows = attentionView === "renewals" ? data?.attention.renewals ?? [] : data?.attention.inactive ?? [];
  const attentionTotal = attentionView === "renewals" ? data?.attention.renewal_total ?? 0 : data?.attention.inactive_total ?? 0;

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
                      <div className="flex items-center gap-1 flex-wrap">
                        <p className="text-sm font-medium text-foreground truncate">{b.userName}</p>
                        {b.isCoaching && (
                          <span className="rounded px-1.5 py-px text-[9px] font-medium leading-tight bg-purple-100 text-purple-700">
                            Coaching
                          </span>
                        )}
                        {b.isCorporate && (
                          <span className="rounded px-1.5 py-px text-[9px] font-medium leading-tight bg-blue-100 text-blue-700 max-w-[140px] truncate">
                            {b.corporateName ? `Corp · ${b.corporateName}` : "Corp"}
                          </span>
                        )}
                        {b.usingHours && (
                          <span className="rounded px-1.5 py-px text-[9px] font-medium leading-tight bg-amber-100 text-amber-700">
                            Hours
                          </span>
                        )}
                        {b.firstVisitHere && <span className="rounded px-1.5 py-px text-[10px] font-medium bg-accent text-accent-foreground">First visit here</span>}
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

        {/* Customer attention */}
        <Card className="border border-border shadow-none rounded-lg bg-card min-w-0">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-base font-display font-medium">{attentionView === "renewals" ? "Renewal opportunities" : "Inactive repeat customers"}</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-primary h-auto py-1 shrink-0"
              onClick={() => navigate(`/admin?tab=allusers&preset=${attentionView === "renewals" ? "renewal-opportunities" : "inactive-repeat"}`)}
            >
              View all ({attentionTotal}) →
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <Tabs value={attentionView} onValueChange={setAttentionView} className="pb-2"><TabsList className="w-full"><TabsTrigger value="renewals" className="flex-1">Renewals</TabsTrigger><TabsTrigger value="inactive" className="flex-1">Inactive repeat</TabsTrigger></TabsList></Tabs>
            {attentionRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{attentionView === "renewals" ? "No active members running low on hours" : "No inactive repeat customers"}</p>
            ) : (
              attentionRows.map((m) => (
                <Button
                  key={m.id}
                  variant="ghost"
                  onClick={() => navigate(`/members/${m.id}/360`)}
                  aria-label={`Open ${m.display_name || m.email || "customer"} Member360`}
                  className="flex w-full h-auto items-center gap-3 rounded-lg border border-border/40 px-3 py-2.5 text-left whitespace-normal"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
                    {getInitials(m.display_name || m.email || "?")}
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <p className="text-sm font-medium text-foreground truncate">
                      {m.display_name || m.email || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {attentionView === "renewals" && m.next_booking ? `Next · ${format(new Date(m.next_booking), "dd MMM, HH:mm")}` : m.last_visit ? `Last visit · ${format(new Date(m.last_visit), "dd MMM yyyy")}` : "—"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-primary">
                      {attentionView === "renewals" ? Number(m.hours_remaining).toLocaleString(undefined, { maximumFractionDigits: 2 }) : m.lifetime_visits}
                    </p>
                    <p className="text-xs text-muted-foreground">{attentionView === "renewals" ? "hours left" : "visits"}</p>
                  </div>
                </Button>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
