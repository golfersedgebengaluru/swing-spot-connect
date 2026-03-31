import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClipboardList, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAllBookings, useBays, useApproveBooking, useRejectBooking, useAdminCancelBooking, useAllCities } from "@/hooks/useBookings";
import { useAdmin } from "@/hooks/useAdmin";
import { format } from "date-fns";

export function AdminBookingLogsTab() {
  const { data: bookings, isLoading } = useAllBookings();
  const { data: bays } = useBays();
  const approveBooking = useApproveBooking();
  const rejectBooking = useRejectBooking();
  const adminCancelBooking = useAdminCancelBooking();
  const { toast } = useToast();
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [rejectMessages, setRejectMessages] = useState<Record<string, string>>({});

  const { isAdmin, assignedCities } = useAdmin();
  const { data: allCities = [] } = useAllCities();
  const cities = isAdmin ? allCities : allCities.filter((c) => assignedCities.includes(c));

  // For site-admins, pre-filter bookings to their assigned cities
  const scopedBookings = isAdmin
    ? bookings
    : (bookings ?? []).filter((b: any) => assignedCities.includes(b.city));

  const filtered = (scopedBookings ?? []).filter((b: any) => {
    if (cityFilter !== "all" && b.city !== cityFilter) return false;
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    return true;
  });

  const sorted = [...filtered].sort((a: any, b: any) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (a.status !== "pending" && b.status === "pending") return 1;
    return new Date(b.start_time).getTime() - new Date(a.start_time).getTime();
  });

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

  const handleAdminCancel = async (id: string) => {
    if (!window.confirm("Are you sure you want to cancel this booking? Hours will be refunded if applicable.")) return;
    try {
      await adminCancelBooking.mutateAsync(id);
      toast({ title: "Booking Cancelled", description: "Booking has been cancelled and hours refunded." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading) return <Loader2 className="mx-auto h-8 w-8 animate-spin" />;

  const pendingCount = (bookings ?? []).filter((b: any) => b.status === "pending").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" /> Booking Logs
          {pendingCount > 0 && (
            <Badge className="bg-amber-500/15 text-amber-600 border-amber-300">{pendingCount} pending</Badge>
          )}
        </CardTitle>
        <div className="flex gap-3 mt-2">
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cities</SelectItem>
              {cities.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
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
            {sorted.map((b: any) => (
              <TableRow key={b.id} className={b.status === "pending" ? "bg-amber-500/5" : ""}>
                <TableCell className="font-medium">
                  <div>{b.display_name}</div>
                  <Badge variant="outline" className="text-[10px] mt-0.5">
                    {b.user_type === "member" ? "👤 Member" : b.user_type === "non-registered" ? "🔗 Guest" : "📝 Registered"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div>{b.city}</div>
                  {b.bay_name && <div className="text-xs text-muted-foreground">{b.bay_name}</div>}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={b.session_type === "coaching" ? "text-primary" : ""}>
                    {b.session_type === "coaching" ? "🎓 Coaching" : "Practice"}
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
                  {(b.status === "confirmed" || b.status === "pending") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAdminCancel(b.id)}
                      disabled={adminCancelBooking.isPending}
                      className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 mt-1"
                    >
                      🚫 Cancel
                    </Button>
                  )}
                  {b.status === "rejected" && b.note && (
                    <span className="text-xs text-muted-foreground italic">"{b.note}"</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </CardContent>
    </Card>
  );
}
