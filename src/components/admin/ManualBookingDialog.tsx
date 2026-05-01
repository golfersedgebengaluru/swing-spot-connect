import { useState, useMemo, useEffect, useCallback } from "react";
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
  ArrowLeft, ArrowRight, User, CheckCircle2, Users, Banknote, Search, Hourglass, AlertTriangle, Wallet,
} from "lucide-react";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useBays, useCities, useAvailableSlots } from "@/hooks/useBookings";
import { getBookableWindow } from "@/lib/extended-hours";
import { Switch } from "@/components/ui/switch";
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
import { useAdvanceBalance, useDrawdownAdvance } from "@/hooks/useAdvanceAccount";
import { useProfileBillingInfo } from "@/hooks/useCorporateAccounts";
import { Building2 } from "lucide-react";

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
  const [advanceDrawdown, setAdvanceDrawdown] = useState<number>(0);

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

  // Extended hours: opt-in toggle, only available when the selected member has access.
  // Defaults to off so the admin slot grid mirrors the public booking flow and avoids
  // pulling in early-morning calendar conflicts that previously blanked out availability.
  const [showExtended, setShowExtended] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [bookingComplete, setBookingComplete] = useState(false);

  useEffect(() => {
    if (globalCity) setSelectedCity(globalCity);
  }, [globalCity]);

  const cityBays = useMemo(() => (bays ?? []).filter((b: any) => b.city === selectedCity && b.is_active), [bays, selectedCity]);
  const effectiveBayId = cityBays.length === 1 ? cityBays[0]?.id : selectedBayId;
  const currentBay = cityBays.find((b: any) => b.id === effectiveBayId);

  // Fetch calendar availability when bay + date are selected.
  // Default to the bay's normal window (matches the public flow). The admin can opt in
  // to extended hours per booking, but only if the selected customer has the
  // `extended_hours_access` flag enabled on their profile.
  const slotDate = selectedDate ? format(selectedDate, "yyyy-MM-dd") : undefined;
  const customerHasExtendedAccess = !!selectedProfile?.extended_hours_access;
  const canUseExtended = customerHasExtendedAccess && !!currentBay?.extended_hours_enabled;
  const effectiveShowExtended = showExtended && canUseExtended;
  const bookableWindow = getBookableWindow(currentBay as any, effectiveShowExtended);
  const { data: availableSlots, isLoading: slotsLoading } = useAvailableSlots(
    currentBay?.calendar_email,
    slotDate,
    bookableWindow?.openTime,
    bookableWindow?.closeTime,
    { refetchInterval: 0, includeExtended: effectiveShowExtended }
  );

  // Detect conflict: check if the selected manual time overlaps any busy slot
  const hasConflict = useMemo(() => {
    if (!availableSlots || !selectedDate || !startHour || !startMinute) return false;
    const startMins = parseInt(startHour) * 60 + parseInt(startMinute);
    const endMins = startMins + duration;
    return availableSlots.some((slot) => {
      if (slot.available) return false;
      const slotDate = new Date(slot.time);
      const h = slotDate.getHours();
      const m = slotDate.getMinutes();
      const slotStart = h * 60 + m;
      const slotEnd = slotStart + 30; // slots are 30-min intervals
      return slotStart < endMins && slotEnd > startMins;
    });
  }, [availableSlots, selectedDate, startHour, startMinute, duration]);

  const handleSlotClick = useCallback((time: string) => {
    const d = new Date(time);
    setStartHour(String(d.getHours()).padStart(2, "0"));
    setStartMinute(String(d.getMinutes()).padStart(2, "0"));
  }, []);

  const playerSessionType = numPlayers === 1 ? "individual" : numPlayers === 2 ? "couple" : "group";

  const currentPrice = useMemo(() => {
    if (!selectedCity || !bayPricing || !selectedDate) return null;
    const isWeekend = [0, 6].includes(selectedDate.getDay());
    const dayType = isWeekend ? "weekend" : "weekday";
    if (sessionType === "coaching") {
      // Use coaching rate from bay_pricing (e.g. coaching_60)
      return bayPricing.find((p: any) => p.city === selectedCity && p.day_type === dayType && p.session_type.includes("coaching")) ?? null;
    }
    return bayPricing.find((p: any) => p.city === selectedCity && p.day_type === dayType && p.session_type === playerSessionType) ?? null;
  }, [selectedCity, bayPricing, selectedDate, playerSessionType, sessionType]);

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

      // Search regular profiles
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, user_id, display_name, email, phone, user_type, extended_hours_access")
        .or(`display_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
        .limit(10);

      // Search league players by league name, tenant name, or player name
      const { data: leaguePlayers } = await supabase
        .from("league_players" as any)
        .select(`
          id,
          user_id,
          leagues!inner(name, tenant_id, tenants:tenant_id(name))
        `)
        .limit(20);

      // Build league player results that match search query
      const leagueResults: any[] = [];
      const seenUserIds = new Set((profileData ?? []).map((p: any) => p.user_id || p.id));

      if (leaguePlayers) {
        for (const lp of leaguePlayers as any[]) {
          const leagueName = lp.leagues?.name ?? "";
          const tenantName = lp.leagues?.tenants?.name ?? "";
          const tag = `${tenantName} - ${leagueName}`;

          if (
            !tag.toLowerCase().includes(q) &&
            !leagueName.toLowerCase().includes(q) &&
            !tenantName.toLowerCase().includes(q)
          ) continue;

          if (seenUserIds.has(lp.user_id)) {
            // Augment existing profile result with league tag
            const existing = (profileData ?? []).find(
              (p: any) => (p.user_id || p.id) === lp.user_id
            );
          if (existing && !(existing as any).league_tag) {
            (existing as any).league_tag = `League: ${tag}`;
            }
            continue;
          }

          // Fetch profile for this league player
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, user_id, display_name, email, phone, user_type, extended_hours_access")
            .eq("user_id", lp.user_id)
            .single();

          if (profile) {
            seenUserIds.add(lp.user_id);
            leagueResults.push({
              ...profile,
              league_tag: `League: ${tag}`,
            });
          }
        }
      }

      setSearchResults([...(profileData ?? []), ...leagueResults]);
    } finally {
      setIsSearching(false);
    }
  };

  // Fetch hours balance for selected profile using the DB function.
  // Also resets the extended-hours toggle whenever the customer changes so it can't
  // leak across different members with different access levels.
  useEffect(() => {
    setShowExtended(false);
    if (!selectedProfile) { setHoursBalance(null); return; }
    const uid = selectedProfile.user_id || selectedProfile.id;
    supabase
      .rpc("get_hours_balance", { p_user_id: uid })
      .then(({ data, error }) => {
        if (error) { console.error("Failed to fetch hours balance:", error); setHoursBalance(null); return; }
        setHoursBalance(Number(data) || 0);
      });
  }, [selectedProfile]);

  const customerName = customerMode === "existing" ? selectedProfile?.display_name : guestName;
  const customerEmail = customerMode === "existing" ? selectedProfile?.email : guestEmail;
  const customerPhone = customerMode === "existing" ? selectedProfile?.phone : guestPhone;
  const customerUserId = customerMode === "existing" ? (selectedProfile?.user_id || selectedProfile?.id) : null;

  // Advance balance
  const { data: advanceBalance } = useAdvanceBalance(customerUserId);
  const drawdownAdvance = useDrawdownAdvance();

  // Corporate billing detection (skips per-session payment, defers to monthly invoice)
  const { data: billingInfo } = useProfileBillingInfo(
    customerMode === "existing" ? selectedProfile?.id : null
  );
  const isCorporate = !!billingInfo?.corporate;
  const corporateAccount = billingInfo?.corporate ?? null;

  // Force manual mode for corporate (no hours, no need for offline method selection)
  useEffect(() => {
    if (isCorporate && paymentMode !== "manual") setPaymentMode("manual");
  }, [isCorporate]); // eslint-disable-line react-hooks/exhaustive-deps

  const canProceedFromCustomer = customerMode === "existing" ? !!selectedProfile : (!!guestName.trim() && (!!guestEmail.trim() || !!guestPhone.trim()));
  const canProceedFromSlot = !!selectedCity && !!currentBay && !!selectedDate && !!startTime;
  const hoursNeeded = sessionType === "coaching" ? (currentBay?.coaching_hours ?? 1) : duration / 60;
  const canPayWithHours = paymentMode === "hours" && hoursBalance !== null && hoursBalance >= hoursNeeded;
  const canConfirm = isCorporate
    ? true
    : paymentMode === "hours" ? canPayWithHours : !!selectedPaymentMethod;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = addDays(today, 90);
  const isBackdated = isCorporate && !!selectedDate && selectedDate < today;

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
        if (res.error) {
          let errorMsg = "Booking failed";
          try { const body = await (res.error as any).context?.json?.(); errorMsg = body?.error || res.error.message || errorMsg; } catch { errorMsg = res.error.message || errorMsg; }
          throw new Error(errorMsg);
        }
        if (res.data?.error) throw new Error(res.data.error);
      } else {
        // Manual payment → guest_booking flow (creates revenue transaction)
        // For corporate (deferred billing), no revenue tx is created — rolled into monthly invoice.
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
            payment_id: isCorporate ? null : (paymentReference || null),
            order_id: null,
            amount: isCorporate ? 0 : totalCost,
            currency: currentPrice?.currency || "INR",
            gateway_name: isCorporate ? "corporate_deferred" : selectedPaymentMethod,
            user_id_override: customerUserId || undefined,
            billing_status: isCorporate ? "deferred" : "immediate",
            backdated: isBackdated,
          },
        });
        if (res.error) {
          let errorMsg = "Booking failed";
          try { const body = await (res.error as any).context?.json?.(); errorMsg = body?.error || res.error.message || errorMsg; } catch { errorMsg = res.error.message || errorMsg; }
          throw new Error(errorMsg);
        }
        if (res.data?.error) throw new Error(res.data.error);

        // Skip per-session invoice for corporate (issued at month-end as consolidated invoice)
        if (isCorporate) {
          // no-op for invoice / advance drawdown
        } else {

        // Generate invoice
        try {
          const linkedPricing = currentPrice as any;
          const serviceProductId = linkedPricing?.service_product_id;
          const serviceProduct = serviceProductId ? (products ?? []).find((p: any) => p.id === serviceProductId) : null;

          const itemName = serviceProduct?.name || `${currentBay.name} - ${playerSessionType} session`;
          const gstRate = serviceProduct?.gst_rate ?? 18;
          const sacCode = serviceProduct?.sac_code || "";
          const hsnCode = serviceProduct?.hsn_code || "";

          const { data: gstProfile } = await supabase.from("gst_profiles")
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
        } // end else (non-corporate invoice)
      }

      // Process advance drawdown — skip for corporate (deferred billing)
      if (!isCorporate && advanceDrawdown > 0 && customerUserId && selectedCity) {
        try {
          await drawdownAdvance.mutateAsync({
            customerId: customerUserId,
            amount: advanceDrawdown,
            description: `Drawdown against manual booking`,
            city: selectedCity,
          });
        } catch (advErr: any) {
          console.error("Advance drawdown failed (non-fatal):", advErr);
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
      queryClient.invalidateQueries({ queryKey: ["advance_balance"] });
      queryClient.invalidateQueries({ queryKey: ["advance_transactions"] });

      setBookingComplete(true);
      toast({ title: "Manual Booking Created!", description: isCorporate ? `Booking deferred to ${corporateAccount?.name} monthly invoice.` : paymentMode === "hours" ? `${hoursNeeded}h deducted from ${customerName}'s balance.` : `Payment via ${selectedPaymentMethod} recorded.` });
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
    setAdvanceDrawdown(0);
    setShowExtended(false);
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
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto overflow-x-hidden">
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
                          {p.league_tag && (
                            <Badge variant="secondary" className="ml-2 text-[10px]">{p.league_tag}</Badge>
                          )}
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
                        <div className="flex gap-1.5">
                          {hoursBalance !== null && (
                            <Badge variant="secondary" className="text-xs">
                              <Hourglass className="h-3 w-3 mr-1" /> {hoursBalance.toFixed(1)}h
                            </Badge>
                          )}
                          {advanceBalance != null && advanceBalance > 0 && (
                            <Badge variant="outline" className="text-xs text-primary border-primary/30">
                              <Wallet className="h-3 w-3 mr-1" /> ₹{advanceBalance.toLocaleString()}
                            </Badge>
                          )}
                        </div>
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
                    disabled={(date) => (isCorporate ? date > maxDate : (date < today || date > maxDate))}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
              {isCorporate && selectedDate && selectedDate < today && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Backdated entry — accounting only. No calendar sync, no notifications.
                </p>
              )}
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

            {/* Extended hours toggle (existing members only, when bay supports it) */}
            {currentBay?.extended_hours_enabled && customerMode === "existing" && (
              <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 p-2.5">
                <div className="space-y-0.5">
                  <Label htmlFor="ext-hours" className="text-xs font-medium flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> Show extended hours
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    {canUseExtended
                      ? `Includes ${currentBay.extended_open_time?.slice(0, 5)}–${currentBay.extended_close_time?.slice(0, 5)} window.`
                      : "Customer does not have extended-hours access."}
                  </p>
                </div>
                <Switch
                  id="ext-hours"
                  checked={effectiveShowExtended}
                  disabled={!canUseExtended}
                  onCheckedChange={setShowExtended}
                />
              </div>
            )}

            {/* Calendar Availability Grid */}
            {currentBay && selectedDate && (
              <div>
                <Label className="flex items-center gap-1.5 mb-1.5">
                  <CalendarIcon className="h-3.5 w-3.5" /> Slot Availability
                </Label>
                {slotsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading slots…
                  </div>
                ) : availableSlots && availableSlots.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {availableSlots.map((slot) => {
                      const slotD = new Date(slot.time);
                      const isSelected = String(slotD.getHours()).padStart(2, "0") === startHour && String(slotD.getMinutes()).padStart(2, "0") === startMinute;
                      return (
                        <button
                          key={slot.time}
                          type="button"
                          onClick={() => slot.available && handleSlotClick(slot.time)}
                          className={cn(
                            "px-2 py-1 rounded-md text-xs font-medium border transition-colors",
                            slot.available
                              ? isSelected
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background text-foreground border-border hover:bg-accent hover:text-accent-foreground"
                              : "bg-muted text-muted-foreground border-transparent cursor-not-allowed line-through opacity-60"
                          )}
                          disabled={!slot.available}
                        >
                          {(() => { const sd = new Date(slot.time); return `${String(sd.getHours()).padStart(2, "0")}:${String(sd.getMinutes()).padStart(2, "0")}`; })()}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No calendar data available. You can still enter a time manually.</p>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">Tap an available slot to auto-fill start time, or enter manually above.</p>
              </div>
            )}

            {/* Conflict Warning */}
            {hasConflict && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-sm">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <span className="text-destructive">
                  This time overlaps with an existing calendar event. The booking can still be created as an override.
                </span>
              </div>
            )}

            {/* Duration */}
            <div>
              <Label className="flex items-center gap-1.5 mb-1.5"><Clock className="h-3.5 w-3.5" /> Duration</Label>
              <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {isCorporate && <SelectItem value="30">30 minutes</SelectItem>}
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="90">1.5 hours</SelectItem>
                  <SelectItem value="120">2 hours</SelectItem>
                  <SelectItem value="150">2.5 hours</SelectItem>
                  <SelectItem value="180">3 hours</SelectItem>
                </SelectContent>
              </Select>
              {isCorporate && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Corporate accounts can book 30-minute slots.
                </p>
              )}
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

            {isCorporate ? (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-sm flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary shrink-0" />
                <span><span className="font-medium">Deferred billing</span> — added to {corporateAccount?.name}'s monthly invoice.</span>
              </div>
            ) : currentPrice && paymentMode !== "hours" && (
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
                <div className="flex justify-between gap-3 min-w-0"><span className="text-muted-foreground shrink-0">Customer</span><span className="font-medium truncate text-right">{customerName}</span></div>
                <div className="flex justify-between gap-3 min-w-0"><span className="text-muted-foreground shrink-0">Bay</span><span className="font-medium truncate text-right">{currentBay?.name}</span></div>
                <div className="flex justify-between gap-3 min-w-0"><span className="text-muted-foreground shrink-0">Date</span><span className="font-medium truncate text-right">{selectedDate && format(selectedDate, "PPP")}</span></div>
                <div className="flex justify-between gap-3 min-w-0"><span className="text-muted-foreground shrink-0">Time</span><span className="font-medium truncate text-right">{startTime && format(new Date(startTime), "h:mm a")} – {endTime && format(new Date(endTime), "h:mm a")}</span></div>
                <div className="flex justify-between gap-3 min-w-0"><span className="text-muted-foreground shrink-0">Duration</span><span className="font-medium text-right">{duration} min</span></div>
                {!isCorporate && currentPrice && (
                  <div className="flex justify-between border-t pt-1.5 mt-1.5">
                    <span className="font-medium">Total</span>
                    <span className="font-bold text-primary">₹{totalCost.toLocaleString()}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Corporate banner — replaces payment selection entirely */}
            {isCorporate && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-3 space-y-1.5 text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <Building2 className="h-4 w-4 text-primary" />
                    Corporate Account: {corporateAccount?.name}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isBackdated
                      ? `Backdated entry for accounting only. Will be added to ${corporateAccount?.name}'s monthly consolidated invoice. No calendar event, no notifications.`
                      : `This session will be added to ${corporateAccount?.name}'s monthly consolidated invoice. No payment is collected now.`}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Payment Mode Toggle (hidden for corporate) */}
            {!isCorporate && (
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
            )}

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

            {!isCorporate && paymentMode === "manual" && (
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

                {/* Advance Balance Drawdown */}
                {customerUserId && advanceBalance != null && advanceBalance > 0 && (
                  <Card className="border-primary/30">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5 text-primary" /> Advance Balance</span>
                        <span className="font-medium text-primary">₹{advanceBalance.toLocaleString()}</span>
                      </div>
                      <div>
                        <Label className="text-xs">Apply from advance</Label>
                        <Input
                          type="number"
                          min={0}
                          max={Math.min(advanceBalance, totalCost)}
                          step={0.01}
                          value={advanceDrawdown || ""}
                          onChange={(e) => setAdvanceDrawdown(Math.min(Number(e.target.value) || 0, advanceBalance, totalCost))}
                          className="mt-1"
                          placeholder="0"
                        />
                      </div>
                      {advanceDrawdown > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Net payable: <span className="font-medium text-foreground">₹{(totalCost - advanceDrawdown).toLocaleString()}</span>
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            <Button className="w-full" size="lg" disabled={isProcessing || !canConfirm} onClick={handleConfirmBooking}>
              {isProcessing ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating Booking...</>
              ) : isCorporate ? (
                `Confirm · Defer to ${corporateAccount?.name} monthly invoice`
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
