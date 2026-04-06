import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ClipboardList, Download, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAllBookings, useBays, useApproveBooking, useRejectBooking, useAdminCancelBooking, useAllCities } from "@/hooks/useBookings";
import { useAdmin } from "@/hooks/useAdmin";
import { useActiveFinancialYear } from "@/hooks/useRevenue";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subWeeks, subMonths, addMonths, parseISO, isWithinInterval } from "date-fns";
import { useAdminCity } from "@/contexts/AdminCityContext";

type Period = "all" | "week" | "month" | "quarter" | "year" | "fy" | "custom";

function getPeriodRange(period: Period, fyStart?: string, fyEnd?: string, customStart?: string, customEnd?: string): { start: Date; end: Date } | null {
  const now = new Date();
  switch (period) {
    case "all": return null;
    case "week": return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case "month": return { start: startOfMonth(now), end: endOfMonth(now) };
    case "quarter": {
      if (fyStart) {
        const fy = new Date(fyStart);
        const monthsSinceFY = (now.getFullYear() - fy.getFullYear()) * 12 + (now.getMonth() - fy.getMonth());
        const currentQ = Math.floor(monthsSinceFY / 3);
        const qStart = addMonths(fy, currentQ * 3);
        const qEnd = addMonths(qStart, 3);
        qEnd.setDate(qEnd.getDate() - 1);
        return { start: qStart, end: qEnd };
      }
      const q = Math.floor(now.getMonth() / 3);
      return { start: new Date(now.getFullYear(), q * 3, 1), end: new Date(now.getFullYear(), (q + 1) * 3, 0) };
    }
    case "year": return { start: startOfYear(now), end: endOfYear(now) };
    case "fy": {
      if (fyStart && fyEnd) return { start: new Date(fyStart), end: new Date(fyEnd) };
      return { start: startOfYear(now), end: endOfYear(now) };
    }
    case "custom": {
      if (customStart && customEnd) return { start: new Date(customStart), end: new Date(customEnd) };
      return null;
    }
  }
}

export function AdminBookingLogsTab() {
  const { data: bookings, isLoading } = useAllBookings();
  const { data: bays } = useBays();
  const approveBooking = useApproveBooking();
  const rejectBooking = useRejectBooking();
  const adminCancelBooking = useAdminCancelBooking();
  const { toast } = useToast();
  const { selectedCity: globalCity } = useAdminCity();
  const { data: activeFY } = useActiveFinancialYear();
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [period, setPeriod] = useState<Period>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const resetPage = () => setPage(0);
  const [rejectMessages, setRejectMessages] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const { isAdmin, assignedCities } = useAdmin();
  const { data: allCities = [] } = useAllCities();
  const cities = isAdmin ? allCities : allCities.filter((c) => assignedCities.includes(c));

  const dateRange = useMemo(
    () => getPeriodRange(period, activeFY?.start_date, activeFY?.end_date, customStart, customEnd),
    [period, activeFY, customStart, customEnd]
  );

  // Scoped bookings based on role
  const scopedBookings = isAdmin
    ? bookings
    : (bookings ?? []).filter((b: any) => assignedCities.includes(b.city));

  // Apply all filters
  const effectiveCityFilter = globalCity || cityFilter;
  const filtered = useMemo(() => {
    return (scopedBookings ?? []).filter((b: any) => {
      if (effectiveCityFilter !== "all" && effectiveCityFilter && b.city !== effectiveCityFilter) return false;
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (typeFilter !== "all" && b.session_type !== typeFilter) return false;
      if (dateRange) {
        const bookingDate = new Date(b.start_time);
        if (!isWithinInterval(bookingDate, { start: dateRange.start, end: dateRange.end })) return false;
      }
      return true;
    });
  }, [scopedBookings, effectiveCityFilter, statusFilter, typeFilter, dateRange]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a: any, b: any) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (a.status !== "pending" && b.status === "pending") return 1;
      return new Date(b.start_time).getTime() - new Date(a.start_time).getTime();
    });
  }, [filtered]);

  const confirmedHours = useMemo(() => {
    return filtered
      .filter((b: any) => b.status === "confirmed")
      .reduce((sum: number, b: any) => sum + (b.duration_minutes ?? 0) / 60, 0);
  }, [filtered]);

  const handleApprove = async (id: string) => {
    try {
      await approveBooking.mutateAsync(id);
      toast({ title: "Booking Approved", description: "Coaching session confirmed and hours deducted." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleReject = async (id: string) => {
    try {
      await rejectBooking.mutateAsync({ bookingId: id, rejectMessage: rejectMessages[id] });
      setRejectMessages((prev) => { const n = { ...prev }; delete n[id]; return n; });
      toast({ title: "Booking Rejected", description: "Coaching request declined and slot freed." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

  const handleAdminCancel = async (id: string) => {
    setCancelConfirmId(null);
    try {
      await adminCancelBooking.mutateAsync(id);
      toast({ title: "Booking Cancelled", description: "Booking has been cancelled and hours refunded." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleExportCSV = () => {
    const headers = ["User", "User Type", "City", "Bay", "Session Type", "Date", "Start Time", "End Time", "Duration (hrs)", "Status", "Note"];
    const rows = sorted.map((b: any) => [
      b.display_name ?? "",
      b.user_type ?? "",
      b.city ?? "",
      b.bay_name ?? "",
      b.session_type ?? "",
      format(new Date(b.start_time), "yyyy-MM-dd"),
      format(new Date(b.start_time), "HH:mm"),
      format(new Date(b.end_time), "HH:mm"),
      (b.duration_minutes / 60).toString(),
      b.status ?? "",
      b.note ?? "",
    ]);
    const csvContent = [headers, ...rows].map((r) => r.map((c: string) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `booking-logs-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  const pendingCount = (bookings ?? []).filter((b: any) => b.status === "pending").length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" /> Booking Logs
            {pendingCount > 0 && (
              <Badge className="bg-amber-500/15 text-amber-600 border-amber-300">{pendingCount} pending</Badge>
            )}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap gap-2 mt-3">
          {!globalCity && (
            <Select value={cityFilter} onValueChange={(v) => { setCityFilter(v); resetPage(); }}>
              <SelectTrigger className="w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cities</SelectItem>
                {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); resetPage(); }}>
            <SelectTrigger className="w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); resetPage(); }}>
            <SelectTrigger className="w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="practice">Practice</SelectItem>
              <SelectItem value="coaching">Coaching</SelectItem>
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={(v) => { setPeriod(v as Period); resetPage(); }}>
            <SelectTrigger className="w-full sm:w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
              <SelectItem value="fy">Financial Year</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
          {period === "custom" && (
            <>
              <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-full sm:w-[150px]" />
              <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-full sm:w-[150px]" />
            </>
          )}
        </div>

        {/* Results count */}
        <p className="text-xs text-muted-foreground mt-2">
          {sorted.length} booking{sorted.length !== 1 ? "s" : ""} found
          <span className="ml-3 font-medium text-foreground">⏱ {confirmedHours.toFixed(1)} confirmed hour{confirmedHours !== 1 ? "s" : ""}</span>
        </p>
      </CardHeader>
      <CardContent>
        {(() => {
          const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
          const safePage = Math.min(page, totalPages - 1);
          const paginated = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
          return (
            <>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>City / Bay</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No bookings found.</TableCell></TableRow>
              )}
              {paginated.map((b: any, idx: number) => {
                const avatarColors = [
                  "bg-blue-500/15 text-blue-400",
                  "bg-emerald-500/15 text-emerald-400",
                  "bg-purple-500/15 text-purple-400",
                  "bg-amber-500/15 text-amber-400",
                  "bg-rose-500/15 text-rose-400",
                  "bg-cyan-500/15 text-cyan-400",
                ];
                const avatarClass = avatarColors[idx % avatarColors.length];
                const initials = (b.display_name || "?")
                  .split(" ")
                  .map((w: string) => w[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2);
                return (
                <TableRow key={b.id} className={b.status === "pending" ? "bg-amber-500/5" : ""}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarClass}`}>
                        {initials}
                      </div>
                      <div>
                        <div>{b.display_name}</div>
                        <Badge variant="outline" className="text-[10px] mt-0.5">
                          {b.user_type === "member" ? "👤 Member" : b.user_type === "non-registered" ? "🔗 Guest" : "📝 Registered"}
                        </Badge>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{b.city}</div>
                    {b.bay_name && <div className="text-xs text-muted-foreground">{b.bay_name}</div>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={b.session_type === "coaching" ? "text-primary" : ""}>
                      {b.session_type === "coaching" ? "🎓 Coaching" : "Practice"}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] mt-0.5 block w-fit ${b.note?.startsWith("Invoice") ? "text-blue-600 border-blue-300" : "text-emerald-600 border-emerald-300"}`}>
                      {b.note?.startsWith("Invoice") ? "📄 Invoice" : "🌐 Online"}
                    </Badge>
                  </TableCell>
                  <TableCell>{format(new Date(b.start_time), "PP")}</TableCell>
                  <TableCell>{format(new Date(b.start_time), "h:mm a")} – {format(new Date(b.end_time), "h:mm a")}</TableCell>
                  <TableCell>{b.duration_minutes / 60}h</TableCell>
                  <TableCell>
                    <Badge
                      variant={b.status === "confirmed" ? "secondary" : b.status === "rejected" ? "destructive" : b.status === "cancelled" ? "destructive" : "outline"}
                      className={b.status === "pending" ? "bg-amber-500/15 text-amber-600 border-amber-300" : ""}
                    >
                      {b.status === "pending" ? "🟡 Pending" : b.status === "confirmed" ? "🟢 Confirmed" : b.status === "rejected" ? "🔴 Rejected" : b.status === "cancelled" ? "🚫 Cancelled" : b.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {b.status === "pending" && (
                      <div className="flex flex-col gap-1 items-end">
                        <div className="flex gap-1">
                          <Button size="sm" variant="default" onClick={() => handleApprove(b.id)} disabled={approveBooking.isPending} className="h-7 text-xs">
                            ✓ Approve
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => handleReject(b.id)} disabled={rejectBooking.isPending} className="h-7 text-xs">
                            ✗ Reject
                          </Button>
                        </div>
                        <Textarea
                          placeholder="Enter next available slot or reason (optional)"
                          value={rejectMessages[b.id] || ""}
                          onChange={(e) => setRejectMessages((prev) => ({ ...prev, [b.id]: e.target.value }))}
                          className="text-xs w-56 min-h-[56px] resize-none"
                        />
                      </div>
                    )}
                    {(b.status === "confirmed" || b.status === "pending") && new Date(b.end_time) >= new Date() && (
                      <Badge
                        onClick={() => handleAdminCancel(b.id)}
                        className="cursor-pointer mt-1 bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20 text-xs"
                        variant="outline"
                      >
                        🚫 Cancel
                      </Badge>
                    )}
                    {b.status === "rejected" && b.note && (
                      <span className="text-xs text-muted-foreground italic">"{b.note}"</span>
                    )}
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-3 px-1">
            <p className="text-xs text-muted-foreground">
              {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs px-2">{safePage + 1} / {totalPages}</span>
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
            </>
          );
        })()}
      </CardContent>
    </Card>
  );
}
