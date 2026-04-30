import { useState, useMemo, useCallback } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Clock,
  MapPin,
  Loader2,
  X,
  GraduationCap,
  Download,
  RotateCcw,
  ArrowUpDown,
  Filter,
  CalendarPlus,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useMyBookings, useCancelBooking, useUserHoursBalance, useBays } from "@/hooks/useBookings";
import { useHoursTransactions } from "@/hooks/useMemberHours";
import { useToast } from "@/hooks/use-toast";
import { Navigate, useNavigate } from "react-router-dom";
import { sendNotificationEmail } from "@/hooks/useNotificationEmail";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type SortField = "date" | "status" | "hours";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "confirmed" | "pending" | "cancelled" | "rejected";

const STATUS_CONFIG: Record<string, { emoji: string; label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  confirmed: { emoji: "🟢", label: "Confirmed", variant: "secondary" },
  pending: { emoji: "🟡", label: "Pending", variant: "outline" },
  cancelled: { emoji: "🔴", label: "Cancelled", variant: "destructive" },
  rejected: { emoji: "🔴", label: "Rejected", variant: "destructive" },
  refunded: { emoji: "🟠", label: "Refunded", variant: "outline" },
};

export default function MyBookings() {
  const { user, loading: authLoading } = useAuth();
  const { data: bookings, isLoading } = useMyBookings();
  const { data: balance } = useUserHoursBalance();
  const { data: hoursTx = [] } = useHoursTransactions(user?.id);
  const { data: bays } = useBays();
  const cancelBooking = useCancelBooking();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(null);
  const [cancelDialogBooking, setCancelDialogBooking] = useState<any>(null);

  const { data: cancellationWindowHours = 24 } = useQuery({
    queryKey: ["cancellation_window_hours"],
    queryFn: async () => {
      const { data } = await supabase
        .from("admin_config")
        .select("value")
        .eq("key", "cancellation_window_hours")
        .single();
      const parsed = parseFloat(data?.value ?? "");
      return !isNaN(parsed) && parsed >= 0 ? parsed : 24;
    },
  });

  // Map booking_id → coaching session id (for "View session card" link)
  const { data: linkedSessionsMap } = useQuery({
    queryKey: ["my-bookings-coaching-links", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coaching_sessions")
        .select("id, booking_id")
        .eq("student_user_id", user!.id)
        .not("booking_id", "is", null);
      if (error) throw error;
      const m: Record<string, string> = {};
      (data ?? []).forEach((r: any) => { if (r.booking_id) m[r.booking_id] = r.id; });
      return m;
    },
  });

  

  // Get cancellation penalty info for a booking
  const getCancelInfo = (booking: any) => {
    if (booking.session_type === "coaching" && booking.bay_id && bays) {
      const bay = bays.find((b: any) => b.id === booking.bay_id);
      if (bay) {
        const coachingHrs = bay.coaching_hours ?? 1;
        const refundHrs = bay.coaching_cancellation_refund_hours ?? 0;
        const penalty = coachingHrs - refundHrs;
        return { isCoaching: true, coachingHrs, refundHrs, penalty };
      }
    }
    const practiceHrs = booking.duration_minutes / 60;
    return { isCoaching: false, coachingHrs: 0, refundHrs: practiceHrs, penalty: 0 };
  };

  const handleCancelClick = (booking: any) => {
    const info = getCancelInfo(booking);
    if (info.isCoaching && info.penalty > 0) {
      setConfirmingCancelId(booking.id);
    } else {
      setCancelDialogBooking(booking);
    }
  };

  const performCancel = async (booking: any) => {
    setConfirmingCancelId(null);
    setCancelDialogBooking(null);
    try {
      await cancelBooking.mutateAsync(booking.id);
      toast({ title: "Booking Cancelled", description: "Your hours have been refunded." });
      if (user) {
        const hoursRefunded = booking.duration_minutes / 60;
        sendNotificationEmail({
          user_id: user.id,
          template: "booking_cancelled",
          subject: "❌ Booking Cancelled",
          data: {
            city: booking.city,
            date: new Date(booking.start_time).toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
            hours_refunded: hoursRefunded,
          },
        });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const now = new Date();

  const filteredBookings = useMemo(() => {
    let list = bookings ?? [];
    if (statusFilter !== "all") {
      list = list.filter((b: any) => b.status === statusFilter);
    }
    list = [...list].sort((a: any, b: any) => {
      let cmp = 0;
      if (sortField === "date") cmp = new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
      else if (sortField === "status") cmp = (a.status || "").localeCompare(b.status || "");
      else if (sortField === "hours") cmp = a.duration_minutes - b.duration_minutes;
      return sortDir === "desc" ? -cmp : cmp;
    });
    return list;
  }, [bookings, statusFilter, sortField, sortDir]);

  if (!authLoading && !user) return <Navigate to="/auth" />;

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  };

  const statusBadge = (status: string) => {
    const cfg = STATUS_CONFIG[status] || { emoji: "⚪", label: status, variant: "outline" as const };
    return (
      <Badge variant={cfg.variant} className="text-xs">
        {cfg.emoji} {cfg.label}
      </Badge>
    );
  };

  const exportCSV = () => {
    const rows = filteredBookings.map((b: any) => ({
      Date: format(new Date(b.start_time), "yyyy-MM-dd"),
      Time: `${format(new Date(b.start_time), "h:mm a")} – ${format(new Date(b.end_time), "h:mm a")}`,
      Bay: b.bay_name || "—",
      City: b.city,
      Type: b.session_type || "practice",
      Status: b.status,
      Hours: b.duration_minutes / 60,
    }));
    const header = Object.keys(rows[0] || {}).join(",");
    const csv = [header, ...rows.map((r) => Object.values(r).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bookings_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const canCancelBooking = (booking: any) => {
    // Cannot cancel bookings whose end time has already passed
    if (new Date(booking.end_time) < now) return false;
    const hoursUntil = (new Date(booking.start_time).getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntil >= cancellationWindowHours && ["confirmed", "pending"].includes(booking.status);
  };

  // Mobile card for a booking
  const BookingCard = ({ booking }: { booking: any }) => {
    const start = new Date(booking.start_time);
    const end = new Date(booking.end_time);
    const canCancel = canCancelBooking(booking);

    return (
      <Card className="shadow-md rounded-xl">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                {statusBadge(booking.status)}
                {booking.session_type === "coaching" && (
                  <Badge variant="outline" className="text-xs flex items-center gap-1">
                    <GraduationCap className="h-3 w-3" /> Coaching
                  </Badge>
                )}
              </div>
              <p className="font-medium text-foreground text-sm">{format(start, "EEE, MMM d, yyyy")}</p>
            </div>
            {canCancel && (
              confirmingCancelId === booking.id ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => performCancel(booking)}
                  disabled={cancelBooking.isPending}
                  className="shrink-0 text-xs max-w-[180px]"
                >
                  <span className="truncate">{`⚠ ${getCancelInfo(booking).penalty}h penalty. Cancel`}</span>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCancelClick(booking)}
                  disabled={cancelBooking.isPending}
                  className="shrink-0"
                >
                  <X className="mr-1 h-3 w-3" /> Cancel
                </Button>
              )
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {format(start, "h:mm a")} – {format(end, "h:mm a")}
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {booking.city}
            </div>
            <div className="text-muted-foreground">
              <span className="text-xs uppercase tracking-wide">Bay:</span>{" "}
              <span className="text-foreground">{booking.bay_name || "—"}</span>
            </div>
            <div className="text-muted-foreground">
              <span className="text-xs uppercase tracking-wide">Hours:</span>{" "}
              <span className="text-foreground">{booking.duration_minutes / 60}h</span>
            </div>
          </div>

          {/* Rebook */}
          {["confirmed", "cancelled"].includes(booking.status) && new Date(booking.start_time) < now && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-primary"
              onClick={() => navigate("/bookings")}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Book Again
            </Button>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1 py-6 sm:py-8">
        <div className="container mx-auto px-4">

          {/* Header CTA */}
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">My Bookings</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Next session? Use your <span className="font-semibold text-primary">{balance?.remaining ?? 0}h</span> balance or book now! 🏌️
              </p>
            </div>
            <Button size="lg" onClick={() => navigate("/bookings")} className="shrink-0">
              <CalendarPlus className="mr-2 h-5 w-5" /> Book a Bay
            </Button>
          </div>

          {/* Hours Balance Summary */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <Card className="bg-card shadow-md rounded-xl">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Remaining</p>
                <p className="font-display text-2xl font-bold text-primary">{balance?.remaining ?? 0}h</p>
              </CardContent>
            </Card>
            <Card className="bg-card shadow-md rounded-xl">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Purchased</p>
                <p className="font-display text-2xl font-bold text-foreground">{balance?.purchased ?? 0}h</p>
              </CardContent>
            </Card>
            <Card className="bg-card shadow-md rounded-xl">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Used</p>
                <p className="font-display text-2xl font-bold text-foreground">{balance?.used ?? 0}h</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters & Actions */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="w-36 h-9 text-sm">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="confirmed">🟢 Confirmed</SelectItem>
                  <SelectItem value="pending">🟡 Pending</SelectItem>
                  <SelectItem value="cancelled">🔴 Cancelled</SelectItem>
                  <SelectItem value="rejected">🔴 Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={exportCSV} disabled={filteredBookings.length === 0}>
              <Download className="mr-1 h-4 w-4" /> CSV
            </Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredBookings.length === 0 ? (
            <Card className="shadow-md rounded-xl">
              <CardContent className="py-12 text-center text-muted-foreground">
                <p className="text-lg mb-2">No bookings found</p>
                <Button onClick={() => navigate("/bookings")} className="mt-2">
                  <CalendarPlus className="mr-2 h-4 w-4" /> Book Your First Session
                </Button>
              </CardContent>
            </Card>
          ) : isMobile ? (
            /* Mobile: Card Stack */
            <div className="space-y-3">
              {filteredBookings.map((booking: any) => (
                <BookingCard key={booking.id} booking={booking} />
              ))}
            </div>
          ) : (
            /* Desktop: DataTable */
            <Card className="shadow-md rounded-xl overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("date")}>
                      <span className="flex items-center gap-1">Date <ArrowUpDown className="h-3 w-3" /></span>
                    </TableHead>
                    <TableHead>Bay</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("status")}>
                      <span className="flex items-center gap-1">Status <ArrowUpDown className="h-3 w-3" /></span>
                    </TableHead>
                    <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("hours")}>
                      <span className="flex items-center gap-1 justify-end">Hours <ArrowUpDown className="h-3 w-3" /></span>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBookings.map((booking: any) => {
                    const start = new Date(booking.start_time);
                    const end = new Date(booking.end_time);
                    const canCancel = canCancelBooking(booking);
                    const isPast = start < now;

                    return (
                      <TableRow key={booking.id} className={isPast ? "opacity-60" : ""}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">{format(start, "MMM d, yyyy")}</p>
                            <p className="text-xs text-muted-foreground">{format(start, "h:mm a")} – {format(end, "h:mm a")}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-foreground">{booking.bay_name || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{booking.city}</TableCell>
                        <TableCell>
                          {booking.session_type === "coaching" ? (
                            <Badge variant="outline" className="text-xs flex items-center gap-1 w-fit">
                              <GraduationCap className="h-3 w-3" /> Coaching
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground capitalize">{booking.session_type || "Practice"}</span>
                          )}
                        </TableCell>
                        <TableCell>{statusBadge(booking.status)}</TableCell>
                        <TableCell className="text-right font-medium">{booking.duration_minutes / 60}h</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {canCancel && (
                              confirmingCancelId === booking.id ? (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => performCancel(booking)}
                                  disabled={cancelBooking.isPending}
                                >
                                  {`⚠ ${getCancelInfo(booking).penalty}h penalty. Yes, Cancel`}
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleCancelClick(booking)}
                                  disabled={cancelBooking.isPending}
                                >
                                  <X className="mr-1 h-3 w-3" /> Cancel
                                </Button>
                              )
                            )}
                            {isPast && ["confirmed", "cancelled"].includes(booking.status) && (
                              <Button variant="ghost" size="sm" onClick={() => navigate("/bookings")}>
                                <RotateCcw className="mr-1 h-3 w-3" /> Rebook
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}

          {/* Hours Transaction History */}
          <Card className="shadow-elegant mt-8">
            <CardHeader>
              <CardTitle className="font-display text-xl flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Hours History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {hoursTx.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hours transactions yet.</p>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto">
                  {hoursTx.map((tx: any) => (
                    <div key={tx.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                      <div>
                        <p className="text-sm font-medium text-foreground">{tx.note || tx.type}</p>
                        <p className="text-xs text-muted-foreground">{format(new Date(tx.created_at), "MMM d, yyyy")}</p>
                      </div>
                      <span className={`text-sm font-semibold ${tx.type === "deduction" ? "text-destructive" : "text-primary"}`}>
                        {tx.type === "deduction" ? "-" : "+"}{tx.hours}h
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />

      <AlertDialog open={!!cancelDialogBooking} onOpenChange={(open) => { if (!open) setCancelDialogBooking(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription>Your hours will be refunded. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No – Keep Booking</AlertDialogCancel>
            <AlertDialogAction onClick={() => cancelDialogBooking && performCancel(cancelDialogBooking)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Yes – Cancel Booking</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
