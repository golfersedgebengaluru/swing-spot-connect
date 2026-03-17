import { useState, useMemo } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, Clock, MapPin, Loader2, AlertTriangle, LayoutGrid, GraduationCap } from "lucide-react";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useBays, useAvailableSlots, useCreateBooking, useUserHoursBalance, useUserProfile, useUpdatePreferredCity } from "@/hooks/useBookings";
import { useToast } from "@/hooks/use-toast";
import { Navigate } from "react-router-dom";

export default function Bookings() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const { data: bays, isLoading: loadingBays } = useBays();
  const { data: profile } = useUserProfile();
  const { data: balance } = useUserHoursBalance();
  const updateCity = useUpdatePreferredCity();
  const createBooking = useCreateBooking();

  const [selectedCity, setSelectedCity] = useState<string>("");
  const [selectedBayId, setSelectedBayId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(60);
  const [sessionType, setSessionType] = useState<"practice" | "coaching">("practice");

  // Derive cities from bays
  const cities = useMemo(() => {
    const citySet = new Set((bays ?? []).filter((b: any) => b.is_active).map((b: any) => b.city));
    return Array.from(citySet).sort();
  }, [bays]);

  const effectiveCity = selectedCity || profile?.preferred_city || "";

  // Active bays for selected city
  const cityBays = useMemo(() => {
    return (bays ?? []).filter((b: any) => b.city === effectiveCity && b.is_active);
  }, [bays, effectiveCity]);

  // Auto-select bay if only one
  const effectiveBayId = cityBays.length === 1 ? cityBays[0].id : selectedBayId;
  const currentBay = cityBays.find((b: any) => b.id === effectiveBayId);

  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : undefined;

  const { data: slots, isLoading: loadingSlots } = useAvailableSlots(
    currentBay?.calendar_email,
    dateStr,
    currentBay?.open_time,
    currentBay?.close_time
  );

  // Hours calculation based on session type
  const hoursToDeduct = useMemo(() => {
    if (sessionType === "coaching" && currentBay) {
      return currentBay.coaching_hours ?? 1;
    }
    return duration / 60;
  }, [sessionType, currentBay, duration]);

  // Whether this booking needs approval
  const needsApproval = sessionType === "coaching" && currentBay?.coaching_mode === "approval_required";

  const canBook = useMemo(() => {
    if (!selectedSlot || !slots) return false;
    const slotIndex = slots.findIndex((s) => s.time === selectedSlot);
    if (slotIndex === -1) return false;
    const slotsNeeded = duration / 30;
    for (let i = 0; i < slotsNeeded; i++) {
      const s = slots[slotIndex + i];
      if (!s || !s.available) return false;
    }
    return true;
  }, [selectedSlot, slots, duration]);

  const endTime = useMemo(() => {
    if (!selectedSlot) return null;
    return new Date(new Date(selectedSlot).getTime() + duration * 60 * 1000).toISOString();
  }, [selectedSlot, duration]);

  if (!authLoading && !user) return <Navigate to="/auth" />;

  const handleBook = async () => {
    if (!selectedSlot || !endTime || !currentBay) return;
    try {
      const result = await createBooking.mutateAsync({
        calendar_email: currentBay.calendar_email,
        start_time: selectedSlot,
        end_time: endTime,
        duration_minutes: duration,
        city: effectiveCity,
        bay_id: currentBay.id,
        bay_name: currentBay.name,
        session_type: sessionType,
      });
      if (needsApproval) {
        toast({ title: "Coaching Request Submitted!", description: `Your coaching session is pending admin approval. You'll be notified once it's confirmed.` });
      } else {
        toast({ title: "Bay Booked!", description: `${currentBay.name} is confirmed for ${format(new Date(selectedSlot), "PPp")}.` });
      }
      setSelectedSlot(null);
    } catch (err: any) {
      toast({ title: "Booking Failed", description: err.message, variant: "destructive" });
    }
  };

  const handleCityChange = (city: string) => {
    setSelectedCity(city);
    setSelectedBayId("");
    setSelectedSlot(null);
    if (!profile?.preferred_city) {
      updateCity.mutate(city);
    }
  };

  const handleBayChange = (bayId: string) => {
    setSelectedBayId(bayId);
    setSelectedSlot(null);
  };

  const today = new Date();
  const maxDate = addDays(today, 30);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold text-foreground">Book a Bay</h1>
            <p className="mt-1 text-muted-foreground">Reserve your indoor golf bay session</p>
          </div>

          {/* Balance Card */}
          <Card className="mb-6 shadow-elegant">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-3">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Hours Balance</p>
                  <p className="font-display text-2xl font-bold text-foreground">
                    {balance?.remaining ?? 0}h
                  </p>
                </div>
              </div>
              {(balance?.remaining ?? 0) <= 2 && (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Low Balance
                </Badge>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left: Filters */}
            <div className="space-y-4">
              <Card className="shadow-elegant">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MapPin className="h-4 w-4" /> Location
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={effectiveCity} onValueChange={handleCityChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select city" />
                    </SelectTrigger>
                    <SelectContent>
                      {cities.map((city) => (
                        <SelectItem key={city} value={city}>
                          {city}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {/* Bay Selector - only show if city has multiple bays */}
              {effectiveCity && cityBays.length > 1 && (
                <Card className="shadow-elegant">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <LayoutGrid className="h-4 w-4" /> Bay
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Select value={effectiveBayId} onValueChange={handleBayChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select bay" />
                      </SelectTrigger>
                      <SelectContent>
                        {cityBays.map((bay: any) => (
                          <SelectItem key={bay.id} value={bay.id}>
                            {bay.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {currentBay && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Hours: {currentBay.open_time} – {currentBay.close_time}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Show hours for single bay */}
              {effectiveCity && cityBays.length === 1 && currentBay && (
                <div className="px-1 text-xs text-muted-foreground">
                  {currentBay.name} · {currentBay.open_time} – {currentBay.close_time}
                </div>
              )}

              {/* Session Type */}
              {currentBay && (
                <Card className="shadow-elegant">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <GraduationCap className="h-4 w-4" /> Session Type
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Select value={sessionType} onValueChange={(v) => setSessionType(v as "practice" | "coaching")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="practice">Practice</SelectItem>
                        <SelectItem value="coaching">Coaching</SelectItem>
                      </SelectContent>
                    </Select>
                    {sessionType === "coaching" && currentBay.coaching_mode === "approval_required" && (
                      <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                        ⚠ Coaching sessions require admin approval
                      </p>
                    )}
                    {sessionType === "coaching" && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Coaching deducts {currentBay.coaching_hours ?? 1}h per session
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card className="shadow-elegant">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4" /> Date
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !selectedDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {selectedDate ? format(selectedDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(d) => { setSelectedDate(d); setSelectedSlot(null); }}
                        disabled={(date) => date < today || date > maxDate}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                </CardContent>
              </Card>

              <Card className="shadow-elegant">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="h-4 w-4" /> Duration
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={String(duration)} onValueChange={(v) => { setDuration(Number(v)); setSelectedSlot(null); }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="60">1 hour</SelectItem>
                      <SelectItem value="90">1.5 hours</SelectItem>
                      <SelectItem value="120">2 hours</SelectItem>
                      <SelectItem value="150">2.5 hours</SelectItem>
                      <SelectItem value="180">3 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            </div>

            {/* Right: Slots */}
            <div className="lg:col-span-2">
              <Card className="shadow-elegant">
                <CardHeader>
                  <CardTitle className="text-lg">Available Slots</CardTitle>
                </CardHeader>
                <CardContent>
                  {!effectiveCity || !currentBay || !selectedDate ? (
                    <p className="text-center text-muted-foreground py-12">
                      {!effectiveCity ? "Select a city" : !currentBay ? "Select a bay" : "Select a date"} to view available slots
                    </p>
                  ) : loadingSlots ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : !slots?.length ? (
                    <p className="text-center text-muted-foreground py-12">
                      No slots available for this date
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                        {slots.map((slot) => {
                          const t = new Date(slot.time);
                          const timeStr = format(t, "h:mm a");
                          const isSelected = selectedSlot === slot.time;
                          const slotIdx = slots.findIndex((s) => s.time === slot.time);
                          const slotsNeeded = duration / 30;
                          let canStart = slot.available;
                          for (let i = 1; i < slotsNeeded && canStart; i++) {
                            const next = slots[slotIdx + i];
                            if (!next || !next.available) canStart = false;
                          }

                          return (
                            <Button
                              key={slot.time}
                              variant={isSelected ? "default" : "outline"}
                              size="sm"
                              disabled={!canStart}
                              onClick={() => setSelectedSlot(slot.time)}
                              className={cn(
                                "text-xs",
                                !canStart && "opacity-40",
                                isSelected && "ring-2 ring-primary"
                              )}
                            >
                              {timeStr}
                            </Button>
                          );
                        })}
                      </div>

                      {selectedSlot && (
                        <div className="mt-6 rounded-lg border border-border bg-muted/50 p-4">
                          <h3 className="font-medium text-foreground mb-2">Booking Summary</h3>
                          <div className="space-y-1 text-sm text-muted-foreground">
                            <p><span className="font-medium text-foreground">Bay:</span> {currentBay.name}</p>
                            <p><span className="font-medium text-foreground">City:</span> {effectiveCity}</p>
                            <p><span className="font-medium text-foreground">Session:</span> {sessionType === "coaching" ? "Coaching" : "Practice"}
                              {needsApproval && <Badge variant="outline" className="ml-2 text-amber-600 border-amber-300">Needs Approval</Badge>}
                            </p>
                            <p><span className="font-medium text-foreground">Date:</span> {format(new Date(selectedSlot), "PPP")}</p>
                            <p><span className="font-medium text-foreground">Time:</span> {format(new Date(selectedSlot), "h:mm a")} – {endTime ? format(new Date(endTime), "h:mm a") : ""}</p>
                            <p><span className="font-medium text-foreground">Duration:</span> {duration / 60}h</p>
                            <p><span className="font-medium text-foreground">Hours deducted:</span> {needsApproval ? "Deducted on approval" : `${hoursToDeduct}h`}</p>
                          </div>
                          <Button
                            className="mt-4 w-full"
                            onClick={handleBook}
                            disabled={!canBook || createBooking.isPending || (!needsApproval && (balance?.remaining ?? 0) < hoursToDeduct)}
                          >
                            {createBooking.isPending ? (
                              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Booking...</>
                            ) : !needsApproval && (balance?.remaining ?? 0) < hoursToDeduct ? (
                              "Insufficient Hours"
                            ) : needsApproval ? (
                              "Request Coaching Session"
                            ) : (
                              "Confirm Booking"
                            )}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
