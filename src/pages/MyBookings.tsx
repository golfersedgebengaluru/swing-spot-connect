import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin, Loader2, X } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useMyBookings, useCancelBooking } from "@/hooks/useBookings";
import { useToast } from "@/hooks/use-toast";
import { Navigate } from "react-router-dom";
import { sendNotificationEmail } from "@/hooks/useNotificationEmail";

export default function MyBookings() {
  const { user, loading: authLoading } = useAuth();
  const { data: bookings, isLoading } = useMyBookings();
  const cancelBooking = useCancelBooking();
  const { toast } = useToast();

  if (!authLoading && !user) return <Navigate to="/auth" />;

  const handleCancel = async (booking: any) => {
    try {
      await cancelBooking.mutateAsync(booking.id);
      toast({ title: "Booking Cancelled", description: "Your hours have been refunded." });
      // Send cancellation email
      if (user) {
        sendNotificationEmail({
          user_id: user.id,
          template: "booking_cancelled",
          subject: "❌ Booking Cancelled",
          data: {
            city: booking.city,
            start_time: booking.start_time,
            end_time: booking.end_time,
            duration_minutes: booking.duration_minutes,
          },
        });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const now = new Date();
  const upcoming = (bookings ?? []).filter(
    (b: any) => b.status === "confirmed" && new Date(b.start_time) >= now
  );
  const past = (bookings ?? []).filter(
    (b: any) => b.status !== "confirmed" || new Date(b.start_time) < now
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold text-foreground">My Bookings</h1>
            <p className="mt-1 text-muted-foreground">View and manage your bay reservations</p>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Upcoming */}
              <h2 className="font-display text-xl font-semibold text-foreground mb-4">Upcoming</h2>
              {upcoming.length === 0 ? (
                <Card className="mb-8 shadow-elegant">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No upcoming bookings. <a href="/bookings" className="text-primary underline">Book a bay</a>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3 mb-8">
                  {upcoming.map((booking: any) => {
                    const start = new Date(booking.start_time);
                    const end = new Date(booking.end_time);
                    const hoursUntil = (start.getTime() - now.getTime()) / (1000 * 60 * 60);
                    const canCancel = hoursUntil >= 24;

                    return (
                      <Card key={booking.id} className="shadow-elegant">
                        <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-primary" />
                              <span className="font-medium text-foreground">{booking.city}</span>
                              <Badge variant="secondary">Confirmed</Badge>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(start, "PPP")}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {format(start, "h:mm a")} – {format(end, "h:mm a")}
                              </span>
                              <span>{booking.duration_minutes / 60}h</span>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCancel(booking)}
                            disabled={!canCancel || cancelBooking.isPending}
                            title={!canCancel ? "Cancellations must be 24h+ in advance" : ""}
                          >
                            <X className="mr-1 h-4 w-4" />
                            {canCancel ? "Cancel" : "< 24h"}
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {/* Past */}
              {past.length > 0 && (
                <>
                  <h2 className="font-display text-xl font-semibold text-foreground mb-4">Past & Cancelled</h2>
                  <div className="space-y-3">
                    {past.map((booking: any) => {
                      const start = new Date(booking.start_time);
                      const end = new Date(booking.end_time);
                      return (
                        <Card key={booking.id} className="shadow-elegant opacity-70">
                          <CardContent className="flex items-center justify-between p-4">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium text-foreground">{booking.city}</span>
                                <Badge variant={booking.status === "cancelled" ? "destructive" : "outline"}>
                                  {booking.status === "cancelled" ? "Cancelled" : "Completed"}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span>{format(start, "PPP")}</span>
                                <span>{format(start, "h:mm a")} – {format(end, "h:mm a")}</span>
                                <span>{booking.duration_minutes / 60}h</span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
