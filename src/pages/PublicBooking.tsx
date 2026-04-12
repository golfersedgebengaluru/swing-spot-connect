import { useState, useMemo } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  CalendarIcon, Clock, MapPin, Loader2, LayoutGrid,
  ArrowLeft, ArrowRight, CreditCard, Timer,
  User, Mail, Phone, CheckCircle2, Users,
} from "lucide-react";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useBays, useAvailableSlots, useCreateBooking, useUserHoursBalance, useCities } from "@/hooks/useBookings";
import { useBayPricing } from "@/hooks/usePricing";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CouponInput } from "@/components/shop/CouponInput";
import { ValidateCouponResult, calculateDiscount, useRedeemCoupon } from "@/hooks/useCoupons";

type Step = "select" | "payment" | "confirm";

export default function PublicBooking() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: bays, isLoading: loadingBays } = useBays();
  const { data: balance } = useUserHoursBalance();
  const { data: bayPricing } = useBayPricing();
  const createBooking = useCreateBooking();

  const [step, setStep] = useState<Step>("select");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedBayId, setSelectedBayId] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [duration, setDuration] = useState(60);
  const [numPlayers, setNumPlayers] = useState(1);
  const sessionType = numPlayers === 1 ? "individual" : numPlayers === 2 ? "couple" : "group";

  // Payment method: "hours" or "pay"
  const [paymentMethod, setPaymentMethod] = useState<"hours" | "pay">("pay");

  // Guest info (non-logged-in)
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

  const [bookingComplete, setBookingComplete] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const isGuest = !user;

  // Cities from unified hook
  const { data: cities = [] } = useCities();

  const cityBays = useMemo(() => {
    return (bays ?? []).filter((b: any) => b.city === selectedCity && b.is_active);
  }, [bays, selectedCity]);

  const effectiveBayId = cityBays.length === 1 ? cityBays[0]?.id : selectedBayId;
  const currentBay = cityBays.find((b: any) => b.id === effectiveBayId);

  const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : undefined;

  // Fetch real-time slots for ALL users (including guests)
  const { data: slots, isLoading: loadingSlots } = useAvailableSlots(
    currentBay?.calendar_email,
    dateStr,
    currentBay?.open_time,
    currentBay?.close_time,
    { refetchInterval: 30000 }
  );

  // Get pricing for current selection
  const currentPrice = useMemo(() => {
    if (!selectedCity || !bayPricing) return null;
    const isWeekend = selectedDate ? [0, 6].includes(selectedDate.getDay()) : false;
    const dayType = isWeekend ? "weekend" : "weekday";
    const match = bayPricing.find(
      (p: any) => p.city === selectedCity && p.day_type === dayType && p.session_type === sessionType
    );
    return match;
  }, [selectedCity, bayPricing, selectedDate, sessionType]);

  const totalCost = currentPrice ? currentPrice.price_per_hour * (duration / 60) : 0;

  const endTime = useMemo(() => {
    if (!selectedSlot) return null;
    const end = new Date(new Date(selectedSlot).getTime() + duration * 60 * 1000);
    const y = end.getFullYear();
    const m = String(end.getMonth() + 1).padStart(2, "0");
    const day = String(end.getDate()).padStart(2, "0");
    const hh = String(end.getHours()).padStart(2, "0");
    const mm = String(end.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day}T${hh}:${mm}:00`;
  }, [selectedSlot, duration]);

  const canProceedToPayment = selectedCity && currentBay && selectedDate && selectedSlot;
  const hoursNeeded = duration / 60;
  const hasEnoughHours = (balance?.remaining ?? 0) >= hoursNeeded;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = addDays(today, 30);

  // Load Razorpay script
  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (document.getElementById("razorpay-script")) {
        resolve(true);
        return;
      }
      const script = document.createElement("script");
      script.id = "razorpay-script";
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleConfirmBooking = async () => {
    if (!selectedSlot || !endTime || !currentBay) return;
    setIsProcessing(true);

    try {
      if (user && paymentMethod === "hours") {
        // Member booking with hours — no payment needed
        await createBooking.mutateAsync({
          calendar_email: currentBay.calendar_email,
          start_time: selectedSlot,
          end_time: endTime,
          duration_minutes: duration,
          city: selectedCity,
          bay_id: currentBay.id,
          bay_name: currentBay.name,
          session_type: sessionType,
        });
        setBookingComplete(true);
        toast({ title: "Booking Confirmed!", description: "Hours have been deducted from your balance." });
      } else {
        // Payment flow via Razorpay
        if (totalCost <= 0) {
          toast({ title: "Error", description: "Price not available for this selection.", variant: "destructive" });
          setIsProcessing(false);
          return;
        }

        // 1. Create Razorpay order via edge function
        const orderRes = await supabase.functions.invoke("create-razorpay-order", {
          body: {
            amount: totalCost,
            currency: currentPrice?.currency || "INR",
            city: selectedCity,
            receipt: `booking_${Date.now()}`,
            booking_summary: {
              bay: currentBay.name,
              city: selectedCity,
              date: selectedDate ? format(selectedDate, "yyyy-MM-dd") : "",
              duration: `${duration / 60}h`,
              session_type: sessionType,
            },
          },
        });

        if (orderRes.error || orderRes.data?.error) {
          throw new Error(orderRes.data?.error || orderRes.error?.message || "Failed to create payment order");
        }

        const { order_id, key_id, currency: rzpCurrency } = orderRes.data;

        // 2. Load Razorpay checkout script
        const loaded = await loadRazorpayScript();
        if (!loaded) {
          throw new Error("Failed to load payment gateway. Please try again.");
        }

        // 3. Open Razorpay Checkout
        await new Promise<void>((resolve, reject) => {
          let settled = false;

          const finishResolve = () => {
            if (settled) return;
            settled = true;
            resolve();
          };

          const finishReject = (error: Error) => {
            if (settled) return;
            settled = true;
            reject(error);
          };

          const options = {
            key: key_id,
            amount: Math.round(totalCost * 100),
            currency: rzpCurrency || "INR",
            name: "Golfer's Edge",
            description: `${currentBay.name} · ${duration / 60}h ${sessionType}`,
            order_id: order_id,
            handler: async (response: any) => {
              try {
                setIsProcessing(true);

                if (user) {
                  const bookingResult = await createBooking.mutateAsync({
                    calendar_email: currentBay.calendar_email,
                    start_time: selectedSlot,
                    end_time: endTime!,
                    duration_minutes: duration,
                    city: selectedCity,
                    bay_id: currentBay.id,
                    bay_name: currentBay.name,
                    session_type: sessionType,
                    payment_method: "razorpay",
                  });
                  // Create revenue transaction for registered user payment
                  try {
                     await supabase.from("revenue_transactions").insert({
                      transaction_type: "payment" as any,
                      amount: totalCost,
                      currency: currentPrice?.currency || "INR",
                      user_id: user.id,
                      gateway_name: "razorpay",
                      gateway_order_ref: response.razorpay_order_id,
                      gateway_payment_ref: response.razorpay_payment_id,
                      booking_id: (bookingResult as any)?.booking?.id || null,
                      description: `Payment - ${currentBay.name} · ${duration / 60}h ${sessionType}`,
                      status: "confirmed",
                      city: selectedCity,
                    });
                  } catch (e) {
                    console.error("Failed to create revenue transaction:", e);
                  }
                } else {
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
                      guest_email: guestEmail,
                      guest_phone: guestPhone,
                      calendar_email: currentBay.calendar_email,
                      payment_id: response.razorpay_payment_id,
                      order_id: response.razorpay_order_id,
                      amount: totalCost,
                      currency: currentPrice?.currency || "INR",
                      gateway_name: "razorpay",
                    },
                  });

                   if (res.error) {
                     let errorMsg = "Booking failed";
                     try { const body = await (res.error as any).context?.json?.(); errorMsg = body?.error || res.error.message || errorMsg; } catch { errorMsg = res.error.message || errorMsg; }
                     throw new Error(errorMsg);
                   }
                }

                finishResolve();
              } catch (err) {
                finishReject(err instanceof Error ? err : new Error("Booking failed"));
              }
            },
            prefill: {
              name: user ? undefined : guestName,
              email: user ? undefined : guestEmail,
              contact: user ? undefined : guestPhone,
            },
            theme: { color: "#16a34a" },
            modal: {
              ondismiss: () => {
                finishReject(new Error("Payment cancelled"));
              },
            },
          };

          const rzp = new (window as any).Razorpay(options);

          rzp.on("payment.failed", (response: any) => {
            finishReject(new Error(response?.error?.description || "Payment failed"));
          });

          setIsProcessing(false);
          rzp.open();
        });

        setBookingComplete(true);
        toast({ title: "Booking Confirmed!", description: "Payment processed successfully." });
      }
    } catch (err: any) {
      if (err.message !== "Payment cancelled") {
        toast({ title: "Booking Failed", description: err.message, variant: "destructive" });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Confirmation screen
  if (bookingComplete) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />
        <main className="flex-1 flex items-center justify-center py-12">
          <Card className="max-w-md w-full mx-4">
            <CardContent className="p-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle2 className="h-8 w-8 text-primary" />
              </div>
              <h2 className="font-display text-2xl font-bold text-foreground">Booking Confirmed!</h2>
              <p className="mt-2 text-muted-foreground">
                Your session at {currentBay?.name} on {selectedDate && format(selectedDate, "PPP")} has been confirmed.
              </p>
              <div className="mt-6 space-y-2 text-sm text-left rounded-lg bg-muted/50 p-4">
                <p><span className="font-medium">City:</span> {selectedCity}</p>
                <p><span className="font-medium">Bay:</span> {currentBay?.name}</p>
                <p><span className="font-medium">Time:</span> {selectedSlot && format(new Date(selectedSlot), "h:mm a")} – {endTime && format(new Date(endTime), "h:mm a")}</p>
                <p><span className="font-medium">Duration:</span> {duration / 60}h</p>
                <p><span className="font-medium">Paid via:</span> {paymentMethod === "hours" ? "Bay Hours" : `₹${totalCost.toLocaleString()}`}</p>
              </div>
              <div className="mt-6 flex flex-col gap-2">
                {user ? (
                  <Link to="/my-bookings">
                    <Button className="w-full">View My Bookings</Button>
                  </Link>
                ) : (
                  <Link to="/auth?mode=signup">
                    <Button className="w-full">Join EdgeCollective for More Benefits</Button>
                  </Link>
                )}
                <Link to="/">
                  <Button variant="outline" className="w-full">Back to Home</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1 py-8">
        <div className="container mx-auto max-w-3xl px-4">
          {/* Header */}
          <div className="mb-6">
            <h1 className="font-display text-3xl font-bold text-foreground">Book a Bay</h1>
            <p className="mt-1 text-muted-foreground">
              {isGuest ? "No account needed — book and pay instantly" : "Use your hours or pay per session"}
            </p>
          </div>

          {/* Step Indicator */}
          <div className="mb-8 flex items-center gap-2">
            {[
              { key: "select", label: "Select" },
              { key: "payment", label: "Pay" },
            ].map((s, i) => (
              <div key={s.key} className="flex items-center gap-2">
                {i > 0 && <div className="h-px w-8 bg-border" />}
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors",
                  step === s.key ? "bg-primary text-primary-foreground" :
                    (step === "confirm" || (step === "payment" && s.key === "select"))
                      ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  {i + 1}
                </div>
                <span className={cn("text-sm", step === s.key ? "font-medium text-foreground" : "text-muted-foreground")}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          {/* STEP 1: Select Bay/Date/Time */}
          {step === "select" && (
            <div className="space-y-4">
              {/* City */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="h-4 w-4" /> City
                  </CardTitle>
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
                    <CardTitle className="text-base flex items-center gap-2">
                      <LayoutGrid className="h-4 w-4" /> Bay
                    </CardTitle>
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
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4" /> Date
                  </CardTitle>
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

              {/* Number of Players */}
              {currentBay && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4" /> Number of Players
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9"
                        disabled={numPlayers <= 1}
                        onClick={() => setNumPlayers((p) => Math.max(1, p - 1))}
                      >
                        −
                      </Button>
                      <span className="w-10 text-center text-lg font-medium">{numPlayers}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9"
                        disabled={numPlayers >= 6}
                        onClick={() => setNumPlayers((p) => Math.min(6, p + 1))}
                      >
                        +
                      </Button>
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
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4" /> Duration
                  </CardTitle>
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
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
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

              {/* Proceed Button */}
              <Button
                className="w-full"
                size="lg"
                disabled={!canProceedToPayment}
                onClick={() => setStep("payment")}
              >
                Continue to Payment
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {/* STEP 2: Payment Method */}
          {step === "payment" && (
            <div className="space-y-4">
              <Button variant="ghost" size="sm" onClick={() => setStep("select")} className="mb-2">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>

              {/* Booking Summary */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Booking Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Bay</span><span className="font-medium">{currentBay?.name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">City</span><span className="font-medium">{selectedCity}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium">{selectedDate && format(selectedDate, "PPP")}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span className="font-medium">{selectedSlot && format(new Date(selectedSlot), "h:mm a")} – {endTime && format(new Date(endTime), "h:mm a")}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span className="font-medium">{duration / 60}h</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="font-medium capitalize">{sessionType}</span></div>
                  {currentPrice && (
                    <div className="flex justify-between border-t pt-2 mt-2">
                      <span className="font-medium">Total</span>
                      <span className="font-bold text-primary">₹{totalCost.toLocaleString()}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Guest Info (if not logged in) */}
              {isGuest && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Your Details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label htmlFor="guestName" className="flex items-center gap-1.5 mb-1.5">
                        <User className="h-3.5 w-3.5" /> Full Name *
                      </Label>
                      <Input id="guestName" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="John Doe" />
                      {!guestName.trim() && <p className="text-xs text-destructive mt-1">Name is required</p>}
                    </div>
                    <div>
                      <Label htmlFor="guestEmail" className="flex items-center gap-1.5 mb-1.5">
                        <Mail className="h-3.5 w-3.5" /> Email *
                      </Label>
                      <Input id="guestEmail" type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="you@example.com" />
                      {!guestEmail.trim() && <p className="text-xs text-destructive mt-1">Email is required</p>}
                    </div>
                    <div>
                      <Label htmlFor="guestPhone" className="flex items-center gap-1.5 mb-1.5">
                        <Phone className="h-3.5 w-3.5" /> Phone *
                      </Label>
                      <PhoneInput id="guestPhone" value={guestPhone} onChange={setGuestPhone} />
                      {!guestPhone.trim() && <p className="text-xs text-destructive mt-1">Phone is required</p>}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Payment Method Selection */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Payment Method</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Hours option - only for logged in members */}
                  {user && (
                    <button
                      onClick={() => setPaymentMethod("hours")}
                      className={cn(
                        "w-full flex items-center gap-4 rounded-lg border p-4 text-left transition-colors",
                        paymentMethod === "hours"
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:bg-muted/50"
                      )}
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Timer className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-foreground">Use Bay Hours</p>
                        <p className="text-sm text-muted-foreground">
                          Balance: {balance?.remaining ?? 0}h · Deducts {hoursNeeded}h
                        </p>
                      </div>
                      {!hasEnoughHours && (
                        <Badge variant="destructive" className="text-xs">Insufficient</Badge>
                      )}
                    </button>
                  )}

                  {/* Pay option */}
                  <button
                    onClick={() => setPaymentMethod("pay")}
                    className={cn(
                      "w-full flex items-center gap-4 rounded-lg border p-4 text-left transition-colors",
                      paymentMethod === "pay"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                      <CreditCard className="h-5 w-5 text-accent" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">Pay Now</p>
                      <p className="text-sm text-muted-foreground">
                        {totalCost > 0 ? `₹${totalCost.toLocaleString()}` : "Price TBD"} · Razorpay / UPI / Card
                      </p>
                    </div>
                  </button>
                </CardContent>
              </Card>

              {/* Confirm Button */}
              <Button
                className="w-full"
                size="lg"
                disabled={
                  isProcessing ||
                  (paymentMethod === "hours" && !hasEnoughHours) ||
                  (isGuest && (!guestName.trim() || !guestEmail.trim() || !guestPhone.trim()))
                }
                onClick={handleConfirmBooking}
              >
                {isProcessing ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</>
                ) : paymentMethod === "hours" ? (
                  `Confirm & Deduct ${hoursNeeded}h`
                ) : (
                  `Pay ₹${totalCost.toLocaleString()} & Book`
                )}
              </Button>

              {isGuest && (
                <p className="text-center text-sm text-muted-foreground">
                  Already a member? <Link to="/auth" className="text-primary underline">Sign in</Link> to use your hours
                </p>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
