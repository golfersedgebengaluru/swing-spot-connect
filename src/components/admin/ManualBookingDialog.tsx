import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PhoneInput } from "@/components/ui/phone-input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CalendarIcon, Clock, MapPin, Loader2, LayoutGrid,
  ArrowLeft, ArrowRight, User, CheckCircle2, Users, Banknote, Search, Hourglass,
} from "lucide-react";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useBays, useCities } from "@/hooks/useBookings";
import { useAdminCity } from "@/contexts/AdminCityContext";
import { useBayPricing } from "@/hooks/usePricing";
import { useOfflinePaymentMethods } from "@/hooks/useOfflinePaymentMethods";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateInvoice } from "@/hooks/useInvoices";
import { calculateLineItems, getGstType } from "@/lib/gst-utils";
import { useProducts } from "@/hooks/useProducts";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/useAdmin";

type Step = "customer" | "slot" | "payment" | "confirm";
type CustomerMode = "existing" | "new";
type PaymentMode = "manual" | "hours";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManualBookingDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: bays } = useBays();
  const { data: bayPricing } = useBayPricing();
  const { data: offlineMethods } = useOfflinePaymentMethods();
  const { data: products } = useProducts();
  const createInvoice = useCreateInvoice();
  const { data: cities = [] } = useCities();
  const { selectedCity: globalCity } = useAdminCity();
  const { isAdmin, assignedCities } = useAdmin();

  const availableCities = isAdmin ? cities : cities.filter((c) => assignedCities.includes(c));

  const [step, setStep] = useState<Step>("customer");
  const [customerMode, setCustomerMode] = useState<CustomerMode>("existing");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [hoursBalance, setHoursBalance] = useState<number | null>(null);

  // New guest fields
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

  // Slot fields
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedBayId, setSelectedBayId] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [startHour, setStartHour] = useState("10");
  const [startMinute, setStartMinute] = useState("00");
  const [duration, setDuration] = useState(60);
  const [numPlayers, setNumPlayers] = useState(1);
  const [sessionType, setSessionType] = useState<string>("practice");

  // Payment fields
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("manual");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");
  const [paymentReference, setPaymentReference] = useState("");

  const [isProcessing, setIsProcessing] = useState(false);
  const [bookingComplete, setBookingComplete] = useState(false);

  useEffect(() => {
    if (globalCity) setSelectedCity(globalCity);
  }, [globalCity]);

  const cityBays = useMemo(() => (bays ?? []).filter((b: any) => b.city === selectedCity && b.is_active), [bays, selectedCity]);
  const effectiveBayId = cityBays.length === 1 ? cityBays[0]?.id : selectedBayId;
  const currentBay = cityBays.find((b: any) => b.id === effectiveBayId);

  const playerSessionType = numPlayers === 1 ? "individual" : numPlayers === 2 ? "couple" : "group";

  const currentPrice = useMemo(() => {
    if (!selectedCity || !bayPricing || !selectedDate) return null;
    const isWeekend = [0, 6].includes(selectedDate.getDay());
    const dayType = isWeekend ? "weekend" : "weekday";
    return bayPricing.find((p: any) => p.city === selectedCity && p.day_type === dayType && p.session_type === playerSessionType) ?? null;
  }, [selectedCity, bayPricing, selectedDate, playerSessionType]);

  const totalCost = currentPrice ? currentPrice.price_per_hour * (duration / 60) : 0;

  const startTime = useMemo(() => {
    if (!selectedDate) return null;
    const d = new Date(selectedDate);
    d.setHours(parseInt(startHour), parseInt(startMinute), 0, 0);
    return d.toISOString();
  }, [selectedDate, startHour, startMinute]);

  const endTime = useMemo(() => {
    if (!startTime) return null;
    return new Date(new Date(startTime).getTime() + duration * 60 * 1000).toISOString();
  }, [startTime, duration]);

  // Search profiles
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const q = searchQuery.trim().toLowerCase();
      const { data } = await supabase
        .from("profiles")
        .select("id, user_id, display_name, email, phone, user_type")
        .or(`display_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(10);
      setSearchResults(data ?? []);
    } finally {
      setIsSearching(false);
    }
  };

  // Fetch hours balance for selected profile
  useEffect(() => {
    if (!selectedProfile) { setHoursBalance(null); return; }
    const userId = selectedProfile.user_id || selectedProfile.id;
    supabase
      .from("hours_transactions")
      .select("type, hours")
      .eq("user_id", userId)
      .then(({ data }) => {
        let purchased = 0, used = 0;
        for (const t of data ?? []) {
          if (t.type === "purchase" || t.type === "credit") purchased += Number(t.hours);
          else if (t.type === "adjustment" || t.type === "refund") used -= Number(t.hours);
          else used += Number(t.hours);
        }
        used = Math.max(0, used);
        setHoursBalance(purchased - used);
      });
  }, [selectedProfile]);

  const customerName = customerMode === "existing" ? selectedProfile?.display_name : guestName;
  const customerEmail = customerMode === "existing" ? selectedProfile?.email : guestEmail;
  const customerPhone = customerMode === "existing" ? selectedProfile?.phone : guestPhone;
  const customerUserId = customerMode === "existing" ? (selectedProfile?.user_id || selectedProfile?.id) : null;

  const canProceedFromCustomer = customerMode === "existing" ? !!selectedProfile : (!!guestName.trim() && (!!guestEmail.trim() || !!guestPhone.trim()));
  const canProceedFromSlot = !!selectedCity && !!currentBay && !!selectedDate && !!startTime;
  const hoursNeeded = sessionType === "coaching" ? (currentBay?.coaching_hours ?? 1) : duration / 60;
  const canPayWithHours = paymentMode === "hours" && hoursBalance !== null && hoursBalance >= hoursNeeded;
  const canConfirm = paymentMode === "hours" ? canPayWithHours : !!selectedPaymentMethod;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = addDays(today, 90);

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const minutes = ["00", "30"];

  const handleConfirmBooking = async () => {
    if (!startTime || !endTime || !currentBay) return;
    setIsProcessing(true);

    try {
      if (paymentMode === "hours") {
        const targetUserId = customerUserId!;

        // Create booking via calendar-sync — hours deduction handled server-side
        const res = await supabase.functions.invoke("calendar-sync", {
          body: {
            action: "create_booking",
            calendar_email: currentBay.calendar_email,
            start_time: startTime,
            end_time: endTime,
            duration_minutes: duration,
            city: selectedCity,
            bay_id: currentBay.id,
            bay_name: currentBay.name,
            session_type: sessionType,
            display_name: customerName,
            user_id_override: targetUserId,
            payment_method: "hours",
          },
        });
        if (res.error) throw new Error(res.error.message || "Booking failed");
        if (res.data?.error) throw new Error(res.data.error);
      } else {
        // Manual payment → guest_booking flow (creates revenue transaction)
        const res = await supabase.functions.invoke("calendar-sync", {
          body: {
            action: "guest_booking",
            start_time: startTime,
            end_time: endTime,
            duration_minutes: duration,
            city: selectedCity,
            bay_id: currentBay.id,
            bay_name: currentBay.name,
            session_type: sessionType,
            guest_name: customerName,
            guest_email: customerEmail || null,
            guest_phone: customerPhone || null,
            calendar_email: currentBay.calendar_email,
            payment_id: paymentReference || null,
            order_id: null,
            amount: totalCost,
            currency: currentPrice?.currency || "INR",
            gateway_name: selectedPaymentMethod,
            user_id_override: customerUserId || undefined,
          },
        });
        if (res.error) throw new Error(res.error.message || "Booking failed");
        if (res.data?.error) throw new Error(res.data.error);

        // Generate invoice
        try {
          const linkedPricing = currentPrice as any;
          const serviceProductId = linkedPricing?.service_product_id;
          const serviceProduct = serviceProductId ? (products ?? []).find((p: any) => p.id === serviceProductId) : null;

          const itemName = serviceProduct?.name || `${currentBay.name} - ${playerSessionType} session`;
          const gstRate = serviceProduct?.gst_rate ?? 18;
          const sacCode = serviceProduct?.sac_code || "";
          const hsnCode = serviceProduct?.hsn_code || "";

          const { data: gstProfile } = await (supabase as any)
            .from("gst_profiles")
            .select("state_code")
            .eq("city", selectedCity)
            .maybeSingle();

          const gstType = getGstType(gstProfile?.state_code || "", undefined);
          const lineItems = [{
            itemName,
            itemType: "service" as const,
            hsnCode: hsnCode || undefined,
            sacCode: sacCode || undefined,
            quantity: duration / 60,
            unitPrice: currentPrice?.price_per_hour || totalCost,
            gstRate,
          }];
          const calc = calculateLineItems(lineItems, gstType);

          let revenueTransactionId: string | undefined;
          if (res.data?.booking?.id) {
            const { data: revTx } = await supabase
              .from("revenue_transactions")
              .select("id")
              .eq("booking_id", res.data.booking.id)
              .maybeSingle();
            revenueTransactionId = revTx?.id;
          }

          await createInvoice.mutateAsync({
            customerName: customerName || "",
            customerEmail: customerEmail || undefined,
            customerPhone: customerPhone || undefined,
            lineItems: calc.lines,
            subtotal: calc.subtotal,
            cgstTotal: calc.cgstTotal,
            sgstTotal: calc.sgstTotal,
            igstTotal: calc.igstTotal,
            total: calc.total,
            paymentMethod: selectedPaymentMethod,
            revenueTransactionId,
            city: selectedCity,
            invoiceCategory: "booking",
            bookingBayId: currentBay.id,
            bookingSessionType: sessionType,
            bookingDate: selectedDate ? format(selectedDate, "yyyy-MM-dd") : undefined,
            bookingStartTime: startTime || undefined,
            bookingEndTime: endTime || undefined,
            bookingUserId: customerUserId || undefined,
            customerUserId: customerUserId || undefined,
          });
        } catch (invoiceErr: any) {
          console.error("Invoice generation failed (non-fatal):", invoiceErr);
        }
      }

      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ["all_bookings"] });
      queryClient.invalidateQueries({ queryKey: ["my_bookings"] });
      queryClient.invalidateQueries({ queryKey: ["available_slots"] });
      queryClient.invalidateQueries({ queryKey: ["member_hours"] });
      queryClient.invalidateQueries({ queryKey: ["user_hours_balance"] });
      queryClient.invalidateQueries({ queryKey: ["hours_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["revenue_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["revenue_summary"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });

      setBookingComplete(true);
      toast({ title: "Manual Booking Created!", description: paymentMode === "hours" ? `${hoursNeeded}h deducted from ${customerName}'s balance.` : `Payment via ${selectedPaymentMethod} recorded.` });
    } catch (err: any) {
      toast({ title: "Booking Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const resetForm = () => {
    setStep("customer");
    setCustomerMode("existing");
    setSearchQuery("");
    setSearchResults([]);
    setSelectedProfile(null);
    setHoursBalance(null);
    setGuestName("");
    setGuestEmail("");
    setGuestPhone("");
    setSelectedCity(globalCity || "");
    setSelectedBayId("");
    setSelectedDate(undefined);
    setStartHour("10");
    setStartMinute("00");
    setDuration(60);
    setNumPlayers(1);
    setSessionType("practice");
    setPaymentMode("manual");
    setSelectedPaymentMethod("");
    setPaymentReference("");
    setBookingComplete(false);
    setIsProcessing(false);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  if (bookingComplete) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <div className="p-4 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Booking Created!</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {customerName}'s session at {currentBay?.name} has been confirmed.
            </p>
            <div className="mt-4 space-y-1.5 text-sm text-left rounded-lg bg-muted/50 p-4">
              <p><span className="font-medium">Customer:</span> {customerName}</p>
              <p><span className="font-medium">City:</span> {selectedCity}</p>
              <p><span className="font-medium">Bay:</span> {currentBay?.name}</p>
              <p><span className="font-medium">Date:</span> {selectedDate && format(selectedDate, "PPP")}</p>
              <p><span className="font-medium">Time:</span> {startTime && format(new Date(startTime), "h:mm a")} – {endTime && format(new Date(endTime), "h:mm a")}</p>
              <p><span className="font-medium">Payment:</span> {paymentMode === "hours" ? `${hoursNeeded}h from balance` : `₹${totalCost.toLocaleString()} via ${selectedPaymentMethod}`}</p>
            </div>
            <div className="flex gap-2 mt-4">
              <Button className="flex-1" variant="outline" onClick={handleClose}>Close</Button>
              <Button className="flex-1" onClick={resetForm}>Book Another</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manual Booking</DialogTitle>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center gap-1.5 mb-4">
          {(["customer", "slot", "payment"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-1.5">
              {i > 0 && <div className="h-px w-6 bg-border" />}
              <div className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium",
                step === s ? "bg-primary text-primary-foreground" :
                  (["customer", "slot", "payment"].indexOf(step) > i) ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
              )}>
                {i + 1}
              </div>
              <span className={cn("text-xs", step === s ? "font-medium text-foreground" : "text-muted-foreground")}>
                {s === "customer" ? "Customer" : s === "slot" ? "Slot" : "Payment"}
              </span>
            </div>
          ))}
        </div>

        {/* STEP 1: Customer */}
        {step === "customer" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button variant={customerMode === "existing" ? "default" : "outline"} size="sm" onClick={() => setCustomerMode("existing")}>
                <Search className="h-3.5 w-3.5 mr-1" /> Existing Member
              </Button>
              <Button variant={customerMode === "new" ? "default" : "outline"} size="sm" onClick={() => { setCustomerMode("new"); setSelectedProfile(null); }}>
                <User className="h-3.5 w-3.5 mr-1" /> New Guest
              </Button>
            </div>

            {customerMode === "existing" && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search by name, email, or phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  />
                  <Button variant="outline" size="icon" onClick={handleSearch} disabled={isSearching}>
                    {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>

                {searchResults.length > 0 && (
                  <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                    {searchResults.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedProfile(p)}
                        className={cn(
                          "w-full p-3 text-left text-sm hover:bg-muted/50 transition-colors",
                          selectedProfile?.id === p.id && "bg-primary/5 border-l-2 border-l-primary"
                        )}
                      >
                        <div className="font-medium">{p.display_name || "Unnamed"}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.email} {p.phone && `· ${p.phone}`}
                          <Badge variant="outline" className="ml-2 text-[10px]">{p.user_type}</Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {selectedProfile && (
                  <Card className="border-primary/30">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{selectedProfile.display_name}</p>
                          <p className="text-xs text-muted-foreground">{selectedProfile.email}</p>
                        </div>
                        {hoursBalance !== null && (
                          <Badge variant="secondary" className="text-xs">
                            <Hourglass className="h-3 w-3 mr-1" /> {hoursBalance.toFixed(1)}h balance
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {customerMode === "new" && (
              <div className="space-y-3">
                <div>
                  <Label>Full Name *</Label>
                  <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Customer name" className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Email</Label>
                    <Input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="email@example.com" className="mt-1" />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <div className="mt-1"><PhoneInput value={guestPhone} onChange={setGuestPhone} /></div>
                  </div>
                </div>
              </div>
            )}

            <Button className="w-full" disabled={!canProceedFromCustomer} onClick={() => setStep("slot")}>
              Next: Select Slot <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {/* STEP 2: Slot Selection */}
        {step === "slot" && (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setStep("customer")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>

            {/* City */}
            <div>
              <Label className="flex items-center gap-1.5 mb-1.5"><MapPin className="h-3.5 w-3.5" /> City</Label>
              <Select value={selectedCity} onValueChange={(v) => { setSelectedCity(v); setSelectedBayId(""); }}>
                <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
                <SelectContent>
                  {availableCities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Bay */}
            {selectedCity && cityBays.length > 1 && (
              <div>
                <Label className="flex items-center gap-1.5 mb-1.5"><LayoutGrid className="h-3.5 w-3.5" /> Bay</Label>
                <Select value={effectiveBayId} onValueChange={setSelectedBayId}>
                  <SelectTrigger><SelectValue placeholder="Select bay" /></SelectTrigger>
                  <SelectContent>
                    {cityBays.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Date */}
            <div>
              <Label className="flex items-center gap-1.5 mb-1.5"><CalendarIcon className="h-3.5 w-3.5" /> Date</Label>
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
                    onSelect={setSelectedDate}
                    disabled={(date) => date < today || date > maxDate}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Start Time */}
            <div>
              <Label className="flex items-center gap-1.5 mb-1.5"><Clock className="h-3.5 w-3.5" /> Start Time</Label>
              <div className="flex gap-2">
                <Select value={startHour} onValueChange={setStartHour}>
                  <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {hours.map((h) => <SelectItem key={h} value={h}>{h}:00</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={startMinute} onValueChange={setStartMinute}>
                  <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {minutes.map((m) => <SelectItem key={m} value={m}>:{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Duration */}
            <div>
              <Label className="flex items-center gap-1.5 mb-1.5"><Clock className="h-3.5 w-3.5" /> Duration</Label>
              <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="90">1.5 hours</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                  <SelectItem value="150">2.5 hours</SelectItem>
                  <SelectItem value="180">3 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Players & Session Type */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="flex items-center gap-1.5 mb-1.5"><Users className="h-3.5 w-3.5" /> Players</Label>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={numPlayers <= 1} onClick={() => setNumPlayers((p) => Math.max(1, p - 1))}>−</Button>
                  <span className="w-8 text-center font-medium">{numPlayers}</span>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={numPlayers >= 6} onClick={() => setNumPlayers((p) => Math.min(6, p + 1))}>+</Button>
                </div>
              </div>
              <div>
                <Label className="mb-1.5 block">Session Type</Label>
                <Select value={sessionType} onValueChange={setSessionType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="practice">Practice</SelectItem>
                    <SelectItem value="coaching">Coaching</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {currentPrice && (
              <p className="text-sm text-muted-foreground">
                ₹{currentPrice.price_per_hour}/hr · Total: <span className="font-medium text-foreground">₹{totalCost.toLocaleString()}</span>
              </p>
            )}

            <Button className="w-full" disabled={!canProceedFromSlot} onClick={() => setStep("payment")}>
              Next: Payment <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {/* STEP 3: Payment */}
        {step === "payment" && (
          <div className="space-y-4">
            <Button variant="ghost" size="sm" onClick={() => setStep("slot")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>

            {/* Summary */}
            <Card>
              <CardContent className="p-3 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span className="font-medium">{customerName}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Bay</span><span className="font-medium">{currentBay?.name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-medium">{selectedDate && format(selectedDate, "PPP")}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span className="font-medium">{startTime && format(new Date(startTime), "h:mm a")} – {endTime && format(new Date(endTime), "h:mm a")}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span className="font-medium">{duration / 60}h</span></div>
                {currentPrice && (
                  <div className="flex justify-between border-t pt-1.5 mt-1.5">
                    <span className="font-medium">Total</span>
                    <span className="font-bold text-primary">₹{totalCost.toLocaleString()}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Payment Mode Toggle */}
            <div className="flex gap-2">
              <Button
                variant={paymentMode === "manual" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setPaymentMode("manual")}
              >
                <Banknote className="h-3.5 w-3.5 mr-1" /> Manual Payment
              </Button>
              {customerMode === "existing" && hoursBalance !== null && hoursBalance > 0 && (
                <Button
                  variant={paymentMode === "hours" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setPaymentMode("hours")}
                >
                  <Hourglass className="h-3.5 w-3.5 mr-1" /> Use Hours ({hoursBalance.toFixed(1)}h)
                </Button>
              )}
            </div>

            {paymentMode === "hours" && (
              <Card className={cn("border", canPayWithHours ? "border-primary/30" : "border-destructive/30")}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span>Hours needed</span>
                    <span className="font-medium">{hoursNeeded}h</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Balance</span>
                    <span className="font-medium">{hoursBalance?.toFixed(1)}h</span>
                  </div>
                  {!canPayWithHours && (
                    <p className="text-xs text-destructive mt-2">Insufficient hours balance. Switch to manual payment.</p>
                  )}
                </CardContent>
              </Card>
            )}

            {paymentMode === "manual" && (
              <>
                <div className="space-y-2">
                  {(offlineMethods ?? []).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setSelectedPaymentMethod(m.label)}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-lg border p-2.5 text-left transition-colors",
                        selectedPaymentMethod === m.label
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:bg-muted/50"
                      )}
                    >
                      <Banknote className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium">{m.label}</span>
                    </button>
                  ))}
                </div>
                {selectedPaymentMethod && selectedPaymentMethod.toLowerCase() !== "cash" && (
                  <div>
                    <Label>Payment Reference (optional)</Label>
                    <Input
                      className="mt-1"
                      placeholder="e.g. UPI Ref, Card Auth Code"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                    />
                  </div>
                )}
              </>
            )}

            <Button className="w-full" size="lg" disabled={isProcessing || !canConfirm} onClick={handleConfirmBooking}>
              {isProcessing ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating Booking...</>
              ) : paymentMode === "hours" ? (
                `Confirm · Deduct ${hoursNeeded}h`
              ) : (
                `Confirm · ₹${totalCost.toLocaleString()} via ${selectedPaymentMethod}`
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
