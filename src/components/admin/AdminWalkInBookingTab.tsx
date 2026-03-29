import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CalendarIcon, Clock, MapPin, Loader2, LayoutGrid,
  ArrowLeft, ArrowRight, User, Mail, Phone, CheckCircle2, Users, Banknote,
} from "lucide-react";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useBays, useAvailableSlots } from "@/hooks/useBookings";
import { useBayPricing } from "@/hooks/usePricing";
import { useOfflinePaymentMethods } from "@/hooks/useOfflinePaymentMethods";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateInvoice } from "@/hooks/useInvoices";
import { calculateLineItems, getGstType } from "@/lib/gst-utils";
import { useProducts } from "@/hooks/useProducts";
type Step = "select" | "payment" | "confirm";

export function AdminWalkInBookingTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: bays, isLoading: loadingBays } = useBays();
  const { data: bayPricing } = useBayPricing();
  const { data: offlineMethods } = useOfflinePaymentMethods();
  const { data: products } = useProducts();
  const createInvoice = useCreateInvoice();

  const [step, setStep] = useState<Step>("select");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedBayId, setSelectedBayId] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [duration, setDuration] = useState(60);
  const [numPlayers, setNumPlayers] = useState(1);
  const sessionType = numPlayers === 1 ? "individual" : numPlayers === 2 ? "couple" : "group";

  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");

  const [bookingComplete, setBookingComplete] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const cities = useMemo(() => {
    const s = new Set((bays ?? []).filter((b: any) => b.is_active).map((b: any) => b.city));
    return Array.from(s).sort();
  }, [bays]);

  const cityBays = useMemo(() => {
    return (bays ?? []).filter((b: any) => b.city === selectedCity && b.is_active);
  }, [bays, selectedCity]);

  const effectiveBayId = cityBays.length === 1 ? cityBays[0]?.id : selectedBayId;
  const currentBay = cityBays.find((b: any) => b.id === effectiveBayId);
  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : undefined;

  const { data: slots, isLoading: loadingSlots } = useAvailableSlots(
    currentBay?.calendar_email,
    dateStr,
    currentBay?.open_time,
    currentBay?.close_time,
    { refetchInterval: 30000 }
  );

  const currentPrice = useMemo(() => {
    if (!selectedCity || !bayPricing) return null;
    const isWeekend = selectedDate ? [0, 6].includes(selectedDate.getDay()) : false;
    const dayType = isWeekend ? "weekend" : "weekday";
    return bayPricing.find(
      (p: any) => p.city === selectedCity && p.day_type === dayType && p.session_type === sessionType
    ) ?? null;
  }, [selectedCity, bayPricing, selectedDate, sessionType]);

  const totalCost = currentPrice ? currentPrice.price_per_hour * (duration / 60) : 0;

  const endTime = useMemo(() => {
    if (!selectedSlot) return null;
    return new Date(new Date(selectedSlot).getTime() + duration * 60 * 1000).toISOString();
  }, [selectedSlot, duration]);

  const canProceedToPayment = selectedCity && currentBay && selectedDate && selectedSlot;

  const today = new Date();
  const maxDate = addDays(today, 30);

  const handleConfirmBooking = async () => {
    if (!selectedSlot || !endTime || !currentBay || !selectedPaymentMethod) return;
    setIsProcessing(true);

    try {
      // Create booking via calendar-sync edge function
      const res = await supabase.functions.invoke("calendar-sync", {
        body: {
          action: "guest_booking",
          start_time: selectedSlot,
          end_time: endTime,
          duration_minutes: duration,
          city: selectedCity,
          bay_id: currentBay.id,
          bay_name: currentBay.name,
          session_type: sessionType,
          guest_name: guestName,
          guest_email: guestEmail || null,
          guest_phone: guestPhone || null,
          calendar_email: currentBay.calendar_email,
          // No online payment fields
          payment_id: null,
          order_id: null,
          amount: totalCost,
          currency: currentPrice?.currency || "INR",
          gateway_name: selectedPaymentMethod,
        },
      });

      if (res.error) throw new Error(res.error.message || "Booking failed");
      if (res.data?.error) throw new Error(res.data.error);

      // Create revenue transaction
      await supabase.from("revenue_transactions").insert({
        transaction_type: "guest_booking" as any,
        amount: totalCost,
        currency: currentPrice?.currency || "INR",
        guest_name: guestName,
        guest_email: guestEmail || null,
        guest_phone: guestPhone || null,
        gateway_name: selectedPaymentMethod,
        booking_id: res.data?.booking?.id || null,
        description: `Walk-in: ${currentBay.name} · ${duration / 60}h ${sessionType}`,
        status: "confirmed",
        city: selectedCity,
      });

      queryClient.invalidateQueries({ queryKey: ["revenue_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["revenue_summary"] });
      queryClient.invalidateQueries({ queryKey: ["all_bookings"] });
      queryClient.invalidateQueries({ queryKey: ["available_slots"] });

      setBookingComplete(true);
      toast({ title: "Walk-in Booking Created!", description: `Payment via ${selectedPaymentMethod} recorded.` });
    } catch (err: any) {
      toast({ title: "Booking Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const resetForm = () => {
    setStep("select");
    setSelectedCity("");
    setSelectedBayId("");
    setSelectedDate(undefined);
    setSelectedSlot(null);
    setDuration(60);
    setNumPlayers(1);
    setGuestName("");
    setGuestEmail("");
    setGuestPhone("");
    setSelectedPaymentMethod("");
    setBookingComplete(false);
  };

  if (bookingComplete) {
    return (
      <div className="max-w-lg mx-auto">
        <Card>
          <CardContent className="p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Walk-in Booking Created!</h2>
            <p className="mt-2 text-muted-foreground">
              {guestName}'s session at {currentBay?.name} has been confirmed.
            </p>
            <div className="mt-6 space-y-2 text-sm text-left rounded-lg bg-muted/50 p-4">
              <p><span className="font-medium">Guest:</span> {guestName}</p>
              <p><span className="font-medium">City:</span> {selectedCity}</p>
              <p><span className="font-medium">Bay:</span> {currentBay?.name}</p>
              <p><span className="font-medium">Time:</span> {selectedSlot && format(new Date(selectedSlot), "h:mm a")} – {endTime && format(new Date(endTime), "h:mm a")}</p>
              <p><span className="font-medium">Duration:</span> {duration / 60}h</p>
              <p><span className="font-medium">Payment:</span> ₹{totalCost.toLocaleString()} via {selectedPaymentMethod}</p>
            </div>
            <Button className="mt-6 w-full" onClick={resetForm}>
              Create Another Walk-in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Step Indicator */}
      <div className="flex items-center gap-2 mb-6">
        {[
          { key: "select", label: "Booking Details" },
          { key: "payment", label: "Payment & Confirm" },
        ].map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            {i > 0 && <div className="h-px w-8 bg-border" />}
            <div className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
              step === s.key ? "bg-primary text-primary-foreground" :
                step === "payment" && s.key === "select" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
            )}>
              {i + 1}
            </div>
            <span className={cn("text-sm", step === s.key ? "font-medium text-foreground" : "text-muted-foreground")}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* STEP 1 */}
      {step === "select" && (
        <div className="space-y-4">
          {/* Guest Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" /> Guest Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="wn">Full Name *</Label>
                <Input id="wn" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Walk-in guest name" className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="we">Email</Label>
                  <Input id="we" type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="Optional" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="wp">Phone</Label>
                  <Input id="wp" type="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="Optional" className="mt-1" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* City */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4" /> City</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedCity} onValueChange={(v) => { setSelectedCity(v); setSelectedBayId(""); setSelectedSlot(null); }}>
                <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
                <SelectContent>
                  {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Bay */}
          {selectedCity && cityBays.length > 1 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><LayoutGrid className="h-4 w-4" /> Bay</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={effectiveBayId} onValueChange={(v) => { setSelectedBayId(v); setSelectedSlot(null); }}>
                  <SelectTrigger><SelectValue placeholder="Select bay" /></SelectTrigger>
                  <SelectContent>
                    {cityBays.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}

          {/* Date */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><CalendarIcon className="h-4 w-4" /> Date</CardTitle>
            </CardHeader>
            <CardContent>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !selectedDate && "text-muted-foreground")}>
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
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </CardContent>
          </Card>

          {/* Players */}
          {currentBay && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Number of Players</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="icon" className="h-9 w-9" disabled={numPlayers <= 1} onClick={() => setNumPlayers((p) => Math.max(1, p - 1))}>−</Button>
                  <span className="w-10 text-center text-lg font-medium">{numPlayers}</span>
                  <Button variant="outline" size="icon" className="h-9 w-9" disabled={numPlayers >= 6} onClick={() => setNumPlayers((p) => Math.min(6, p + 1))}>+</Button>
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {sessionType === "individual" ? "Individual" : sessionType === "couple" ? "Couple" : "Group"} rate
                  </Badge>
                </div>
                {currentPrice && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    ₹{currentPrice.price_per_hour}/hr · {currentPrice.label || currentPrice.session_type}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Duration */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Duration</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={String(duration)} onValueChange={(v) => { setDuration(Number(v)); setSelectedSlot(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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

          {/* Time Slots */}
          {currentBay && selectedDate && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Available Slots</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingSlots ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : !slots?.length ? (
                  <p className="text-center text-muted-foreground py-8">No slots available</p>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {slots.map((slot) => {
                      const t = new Date(slot.time);
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
                          className={cn("text-xs", !canStart && "opacity-40", isSelected && "ring-2 ring-primary")}
                        >
                          {format(t, "h:mm a")}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Button
            className="w-full"
            size="lg"
            disabled={!canProceedToPayment || !guestName.trim()}
            onClick={() => setStep("payment")}
          >
            Continue to Payment
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}

      {/* STEP 2: Payment */}
      {step === "payment" && (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setStep("select")} className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>

          {/* Summary */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Booking Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Guest</span><span className="font-medium">{guestName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Bay</span><span className="font-medium">{currentBay?.name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">City</span><span className="font-medium">{selectedCity}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium">{selectedDate && format(selectedDate, "PPP")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span className="font-medium">{selectedSlot && format(new Date(selectedSlot), "h:mm a")} – {endTime && format(new Date(endTime), "h:mm a")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span className="font-medium">{duration / 60}h</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="font-medium capitalize">{sessionType} ({numPlayers} player{numPlayers > 1 ? "s" : ""})</span></div>
              {currentPrice && (
                <div className="flex justify-between border-t pt-2 mt-2">
                  <span className="font-medium">Total</span>
                  <span className="font-bold text-primary">₹{totalCost.toLocaleString()}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Offline Payment Method */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Banknote className="h-4 w-4" /> Payment Collected Via
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(offlineMethods ?? []).map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedPaymentMethod(m.label)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                    selectedPaymentMethod === m.label
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  <Banknote className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-foreground">{m.label}</span>
                </button>
              ))}
              {(!offlineMethods || offlineMethods.length === 0) && (
                <p className="text-sm text-muted-foreground py-2">No payment methods configured. Add them in Settings.</p>
              )}
            </CardContent>
          </Card>

          <Button
            className="w-full"
            size="lg"
            disabled={isProcessing || !selectedPaymentMethod}
            onClick={handleConfirmBooking}
          >
            {isProcessing ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating Booking...</>
            ) : (
              `Confirm Walk-in · ₹${totalCost.toLocaleString()} via ${selectedPaymentMethod}`
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
