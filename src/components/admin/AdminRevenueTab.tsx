import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Download, Loader2, Search, TrendingUp, TrendingDown,
  CreditCard, Users, ArrowUpDown, ShoppingBag,
} from "lucide-react";
import { useRevenueTransactions, useRevenueSummary, useActiveFinancialYear } from "@/hooks/useRevenue";
import { useAllCities } from "@/hooks/useBookings";
import { useAdmin } from "@/hooks/useAdmin";
import { useDefaultCurrency } from "@/hooks/useCurrency";
import { useAdminCity } from "@/contexts/AdminCityContext";
import { useProductCategories } from "@/hooks/useProductCategories";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subWeeks, subMonths, subYears, addMonths } from "date-fns";
import { RevenueUserBreakdown } from "./RevenueUserBreakdown";

type Period = "week" | "month" | "quarter" | "year" | "custom";

function getQuarterDates(fyStart: string, quarterNum: number) {
  const start = new Date(fyStart);
  const qStart = addMonths(start, (quarterNum - 1) * 3);
  const qEnd = addMonths(qStart, 3);
  qEnd.setDate(qEnd.getDate() - 1);
  return { start: format(qStart, "yyyy-MM-dd"), end: format(qEnd, "yyyy-MM-dd") };
}

function getPeriodDates(period: Period, fyStartDate?: string): { start: string; end: string; prevStart: string; prevEnd: string } {
  const now = new Date();
  let start: Date, end: Date, prevStart: Date, prevEnd: Date;

  switch (period) {
    case "week":
      start = startOfWeek(now, { weekStartsOn: 1 });
      end = endOfWeek(now, { weekStartsOn: 1 });
      prevStart = subWeeks(start, 1);
      prevEnd = subWeeks(end, 1);
      break;
    case "month":
      start = startOfMonth(now);
      end = endOfMonth(now);
      prevStart = subMonths(start, 1);
      prevEnd = endOfMonth(prevStart);
      break;
    case "quarter": {
      if (fyStartDate) {
        const fyStart = new Date(fyStartDate);
        const monthsSinceFY = (now.getFullYear() - fyStart.getFullYear()) * 12 + (now.getMonth() - fyStart.getMonth());
        const currentQ = Math.floor(monthsSinceFY / 3) + 1;
        const dates = getQuarterDates(fyStartDate, currentQ);
        const prevDates = getQuarterDates(fyStartDate, currentQ - 1);
        return { start: dates.start, end: dates.end, prevStart: prevDates.start, prevEnd: prevDates.end };
      }
      // Fallback: calendar quarters
      const q = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), q * 3, 1);
      end = new Date(now.getFullYear(), (q + 1) * 3, 0);
      prevStart = new Date(now.getFullYear(), (q - 1) * 3, 1);
      prevEnd = new Date(now.getFullYear(), q * 3, 0);
      break;
    }
    case "year":
      if (fyStartDate) {
        const fyStart = new Date(fyStartDate);
        const thisYearFY = now.getMonth() >= fyStart.getMonth()
          ? new Date(now.getFullYear(), fyStart.getMonth(), fyStart.getDate())
          : new Date(now.getFullYear() - 1, fyStart.getMonth(), fyStart.getDate());
        const thisYearFYEnd = new Date(thisYearFY.getFullYear() + 1, thisYearFY.getMonth(), thisYearFY.getDate() - 1);
        const prevYearFY = new Date(thisYearFY.getFullYear() - 1, thisYearFY.getMonth(), thisYearFY.getDate());
        const prevYearFYEnd = new Date(thisYearFY.getFullYear(), thisYearFY.getMonth(), thisYearFY.getDate() - 1);
        return {
          start: format(thisYearFY, "yyyy-MM-dd"),
          end: format(thisYearFYEnd, "yyyy-MM-dd"),
          prevStart: format(prevYearFY, "yyyy-MM-dd"),
          prevEnd: format(prevYearFYEnd, "yyyy-MM-dd"),
        };
      }
      start = startOfYear(now);
      end = endOfYear(now);
      prevStart = subYears(start, 1);
      prevEnd = endOfYear(prevStart);
      break;
    default:
      start = startOfMonth(now);
      end = endOfMonth(now);
      prevStart = subMonths(start, 1);
      prevEnd = endOfMonth(prevStart);
  }

  return {
    start: format(start, "yyyy-MM-dd"),
    end: format(end, "yyyy-MM-dd"),
    prevStart: format(prevStart, "yyyy-MM-dd"),
    prevEnd: format(prevEnd, "yyyy-MM-dd"),
  };
}

// System-level types that always exist regardless of categories
const SYSTEM_TYPES: Record<string, { label: string; color: string }> = {
  refund: { label: "Refund", color: "bg-red-100 text-red-800" },
};

// Color palette for dynamically generated category types
const CATEGORY_COLORS = [
  "bg-green-100 text-green-800",
  "bg-amber-100 text-amber-800",
  "bg-purple-100 text-purple-800",
  "bg-blue-100 text-blue-800",
  "bg-pink-100 text-pink-800",
  "bg-teal-100 text-teal-800",
  "bg-orange-100 text-orange-800",
  "bg-indigo-100 text-indigo-800",
];

function buildTypeMap(categories: { id: string; name: string }[]) {
  const labels: Record<string, string> = {};
  const colors: Record<string, string> = {};

  categories.forEach((cat, i) => {
    const key = cat.name.toLowerCase().replace(/\s+/g, "_");
    labels[key] = cat.name;
    colors[key] = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
  });

  // Add system types
  for (const [key, val] of Object.entries(SYSTEM_TYPES)) {
    labels[key] = val.label;
    colors[key] = val.color;
  }

  return { labels, colors };
}

export function AdminRevenueTab() {
  const { data: activeFY } = useActiveFinancialYear();
  const { isAdmin, assignedCities } = useAdmin();
  const { data: allCities } = useAllCities();
  const { symbol: currencySymbol } = useDefaultCurrency();
  const { selectedCity: globalCity } = useAdminCity();
  const { data: categories } = useProductCategories();
  const cities = isAdmin ? allCities : (allCities ?? []).filter((c) => assignedCities.includes(c));

  const { labels: typeLabels, colors: typeColors } = useMemo(
    () => buildTypeMap(categories ?? []),
    [categories]
  );
  const [period, setPeriod] = useState<Period>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const effectiveCityFilter = globalCity || cityFilter;
  const [page, setPage] = useState(0);

  const dates = useMemo(() => {
    if (period === "custom" && customStart && customEnd) {
      return { start: customStart, end: customEnd, prevStart: "", prevEnd: "" };
    }
    return getPeriodDates(period, activeFY?.start_date);
  }, [period, customStart, customEnd, activeFY]);

  const selectedCity = effectiveCityFilter !== "all" && effectiveCityFilter ? effectiveCityFilter : undefined;
  const { data: summary, isLoading: loadingSummary } = useRevenueSummary(dates.start, dates.end, selectedCity);
  const { data: prevSummary } = useRevenueSummary(dates.prevStart || undefined, dates.prevEnd || undefined, selectedCity);

  const { data: txnResult, isLoading: loadingTxns } = useRevenueTransactions({
    startDate: dates.start,
    endDate: dates.end,
    type: typeFilter !== "all" ? typeFilter : undefined,
    city: selectedCity,
    search: search || undefined,
    page,
    pageSize: 25,
  });

  const transactions = txnResult?.data ?? [];
  const totalCount = txnResult?.count ?? 0;
  const totalPages = Math.ceil(totalCount / 25);

  const revenueChange = prevSummary?.totalRevenue
    ? ((summary?.totalRevenue ?? 0) - prevSummary.totalRevenue) / prevSummary.totalRevenue * 100
    : null;

  const handleExportCSV = () => {
    if (!transactions.length) return;
    const headers = ["Date", "Type", "City", "Description", "Amount", "Currency", "User/Guest", "Gateway", "Payment Ref", "Status"];
    const rows = transactions.map((t: any) => [
      format(new Date(t.created_at), "yyyy-MM-dd HH:mm"),
      typeLabels[t.transaction_type] || t.transaction_type,
      t.city || "",
      t.description || "",
      t.amount,
      t.currency,
      t.guest_name || t.user_id || "",
      t.gateway_name || "",
      t.gateway_payment_ref || "",
      t.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `revenue_${dates.start}_${dates.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {(["week", "month", "quarter", "year", "custom"] as Period[]).map((p) => (
            <Button
              key={p}
              variant={period === p ? "default" : "outline"}
              size="sm"
              onClick={() => { setPeriod(p); setPage(0); }}
              className="capitalize"
            >
              {p}
            </Button>
          ))}
        </div>
        {period === "custom" && (
          <div className="flex items-center gap-2">
            <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-auto" />
            <span className="text-muted-foreground">to</span>
            <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-auto" />
          </div>
        )}
        {activeFY && (
          <Badge variant="outline" className="text-xs">{activeFY.label}</Badge>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="mt-1 font-display text-2xl font-bold text-foreground">
                  {loadingSummary ? "…" : (summary?.totalRevenue ?? 0).toLocaleString()}
                </p>
                {revenueChange !== null && (
                  <p className={`mt-1 text-xs flex items-center gap-1 ${revenueChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {revenueChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {revenueChange >= 0 ? "+" : ""}{revenueChange.toFixed(1)}% vs prev
                  </p>
                )}
              </div>
              <div className="rounded-xl bg-primary/10 p-3">
                <span className="text-lg font-semibold text-primary">{currencySymbol}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Payments</p>
                <p className="mt-1 font-display text-2xl font-bold text-foreground">
                  {loadingSummary ? "…" : `${currencySymbol}${(summary?.byType?.payment ?? 0).toLocaleString()}`}
                </p>
              </div>
              <div className="rounded-xl bg-green-100 p-3">
                <CreditCard className="h-5 w-5 text-green-700" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Guest Bookings</p>
                <p className="mt-1 font-display text-2xl font-bold text-foreground">
                  {loadingSummary ? "…" : `${currencySymbol}${(summary?.byType?.guest_booking ?? 0).toLocaleString()}`}
                </p>
              </div>
              <div className="rounded-xl bg-amber-100 p-3">
                <Users className="h-5 w-5 text-amber-700" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Shop Orders</p>
                <p className="mt-1 font-display text-2xl font-bold text-foreground">
                  {loadingSummary ? "…" : `${currencySymbol}${(summary?.byType?.product_order ?? 0).toLocaleString()}`}
                </p>
              </div>
              <div className="rounded-xl bg-purple-100 p-3">
                <ShoppingBag className="h-5 w-5 text-purple-700" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* User Spend Breakdown */}
      <RevenueUserBreakdown
        byUser={summary?.byUser ?? {}}
        byGuest={summary?.byGuest ?? {}}
        isLoading={loadingSummary}
      />

      {/* Filters + Export */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="payment">Payment</SelectItem>
            <SelectItem value="guest_booking">Guest Booking</SelectItem>
            <SelectItem value="product_order">Shop Order</SelectItem>
            <SelectItem value="refund">Refund</SelectItem>
          </SelectContent>
        </Select>
        <Select value={cityFilter} onValueChange={(v) => { setCityFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All cities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cities</SelectItem>
            {(cities ?? []).map((city) => (
              <SelectItem key={city} value={city}>{city}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!transactions.length}>
          <Download className="mr-1 h-4 w-4" /> CSV
        </Button>
      </div>

      {/* Transaction Ledger */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4" /> Transaction Ledger
            <Badge variant="outline" className="ml-2 text-xs">{totalCount} total</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingTxns ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : transactions.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No transactions found for this period.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>City</TableHead>
                      <TableHead>User/Guest</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Gateway</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((t: any) => (
                      <TableRow key={t.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {format(new Date(t.created_at), "dd MMM yyyy HH:mm")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`text-xs ${typeColors[t.transaction_type] || ""}`}>
                            {typeLabels[t.transaction_type] || t.transaction_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm">{t.description || "—"}</TableCell>
                        <TableCell className="text-sm">{(t as any).city || "—"}</TableCell>
                        <TableCell className="text-sm">
                          {t.guest_name || (t.user_id ? t.user_id.substring(0, 8) + "…" : "—")}
                        </TableCell>
                        <TableCell className="text-right font-medium whitespace-nowrap">
                          {t.transaction_type === "refund" ? "-" : ""}
                          {t.amount > 0 ? `${currencySymbol}${Number(t.amount).toLocaleString()}` : `${currencySymbol}0`}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {t.gateway_name || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={t.status === "confirmed" ? "default" : "destructive"} className="text-xs">
                            {t.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Page {page + 1} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
