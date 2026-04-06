import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useBays() {
  return useQuery({
    queryKey: ["bays"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bays")
        .select("*")
        .order("city")
        .order("sort_order");
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useBayConfig() {
  return useQuery({
    queryKey: ["bay_config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bay_config")
        .select("*")
        .order("city");
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useAvailableSlots(
  calendarEmail: string | undefined,
  date: string | undefined,
  openTime: string | undefined,
  closeTime: string | undefined,
  options: { refetchInterval?: number } = {}
) {
  return useQuery({
    queryKey: ["available_slots", calendarEmail, date],
    enabled: !!calendarEmail && !!date && !!openTime && !!closeTime,
    queryFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const res = await supabase.functions.invoke("calendar-sync", {
        body: {
          action: "list_slots",
          calendar_email: calendarEmail,
          date,
          open_time: openTime,
          close_time: closeTime,
        },
      });

      if (res.error) throw new Error(res.error.message || "Failed to fetch slots");
      return res.data.slots as { time: string; available: boolean }[];
    },
    ...options,
  });
}

export function useCities() {
  return useQuery({
    queryKey: ["cities"],
    queryFn: async () => {
      const { data } = await supabase
        .from("bays")
        .select("city")
        .eq("is_active", true);
      return [...new Set((data ?? []).map((b: any) => b.city))].sort() as string[];
    },
  });
}

/** All cities from bays table (including inactive) — for admin contexts */
export function useAllCities() {
  return useQuery({
    queryKey: ["all_cities"],
    queryFn: async () => {
      const { data } = await supabase
        .from("bays")
        .select("city");
      return [...new Set((data ?? []).map((b: any) => b.city))].sort() as string[];
    },
  });
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (params: {
      calendar_email: string;
      start_time: string;
      end_time: string;
      duration_minutes: number;
      city: string;
      bay_id: string;
      bay_name?: string;
      session_type?: string;
      payment_method?: string;
    }) => {
      const profile = await supabase
        .from("profiles")
        .select("display_name, user_type")
        .eq("user_id", user?.id)
        .single();

      const res = await supabase.functions.invoke("calendar-sync", {
        body: {
          action: "create_booking",
          ...params,
          display_name: profile.data?.display_name || user?.email,
        },
      });

      if (res.error) throw new Error(res.error.message || "Booking failed");
      if (res.data?.error) throw new Error(res.data.error);

      // Award loyalty points for member usage (non-blocking)
      if (user?.id && params.duration_minutes > 0) {
        const startHour = new Date(params.start_time).getHours();
        const startDay = new Date(params.start_time).getDay();
        const isWeekend = startDay === 0 || startDay === 6;
        const isOffPeak = !isWeekend && (startHour < 10 || startHour >= 18);
        const userType = profile.data?.user_type || "registered";
        const eventType = userType === "eagle" ? "eagle_usage" : "birdie_usage";

        supabase.functions.invoke("calculate-loyalty-points", {
          body: {
            user_id: user.id,
            event_type: eventType,
            hours_used: params.duration_minutes / 60,
            is_off_peak: isOffPeak,
            is_coaching: params.session_type === "coaching",
            staff_id: user.id,
            reason: `Booking: ${params.bay_name || "Bay"} (${params.session_type || "individual"})`,
            booking_id: res.data?.booking?.id,
            metadata: {
              booking_id: res.data?.booking?.id,
              city: params.city,
              session_type: params.session_type,
            },
          },
        }).catch((err) => console.error("Loyalty points (non-fatal):", err));

        // Non-coaching bookings also trigger a "practice" event for coaching follow-through bonus
        if (params.session_type !== "coaching") {
          supabase.functions.invoke("calculate-loyalty-points", {
            body: {
              user_id: user.id,
              event_type: "practice",
              hours_used: params.duration_minutes / 60,
              is_off_peak: isOffPeak,
              staff_id: user.id,
              reason: `Practice session: ${params.bay_name || "Bay"}`,
              booking_id: res.data?.booking?.id,
              metadata: {
                booking_id: res.data?.booking?.id,
                city: params.city,
                session_type: params.session_type,
              },
            },
          }).catch((err) => console.error("Practice loyalty points (non-fatal):", err));
        }
      }

      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["available_slots"] });
      queryClient.invalidateQueries({ queryKey: ["my_bookings"] });
      queryClient.invalidateQueries({ queryKey: ["member_hours"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["user_hours_balance"] });
      queryClient.invalidateQueries({ queryKey: ["hours_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["points_transactions"] });
    },
  });
}

export function useCancelBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await supabase.functions.invoke("calendar-sync", {
        body: { action: "cancel_booking", booking_id: bookingId },
      });

      if (res.error) throw new Error(res.error.message || "Cancellation failed");
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my_bookings"] });
      queryClient.invalidateQueries({ queryKey: ["all_bookings"] });
      queryClient.invalidateQueries({ queryKey: ["available_slots"] });
      queryClient.invalidateQueries({ queryKey: ["member_hours"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["user_hours_balance"] });
      queryClient.invalidateQueries({ queryKey: ["hours_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["revenue_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["revenue_summary"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useApproveBooking() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await supabase.functions.invoke("calendar-sync", {
        body: { action: "approve_booking", booking_id: bookingId },
      });
      if (res.error) throw new Error(res.error.message || "Approval failed");
      if (res.data?.error) throw new Error(res.data.error);

      // Award coaching loyalty points on approval (non-blocking)
      // Fetch booking details to determine hours and user
      const { data: booking } = await supabase
        .from("bookings")
        .select("user_id, duration_minutes, session_type, start_time, city, bay_id")
        .eq("id", bookingId)
        .single();

      if (booking && booking.session_type === "coaching" && booking.user_id) {
        const startHour = new Date(booking.start_time).getHours();
        const startDay = new Date(booking.start_time).getDay();
        const isWeekend = startDay === 0 || startDay === 6;
        const isOffPeak = !isWeekend && (startHour < 10 || startHour >= 18);

        supabase.functions.invoke("calculate-loyalty-points", {
          body: {
            user_id: booking.user_id,
            event_type: "coaching",
            hours_used: (booking.duration_minutes || 60) / 60,
            is_off_peak: isOffPeak,
            is_coaching: true,
            staff_id: user?.id || "system",
            reason: `Coaching session approved`,
            booking_id: bookingId,
            metadata: {
              booking_id: bookingId,
              city: booking.city,
            },
          },
        }).catch((err) => console.error("Loyalty points (non-fatal):", err));
      }

      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all_bookings"] });
      queryClient.invalidateQueries({ queryKey: ["my_bookings"] });
      queryClient.invalidateQueries({ queryKey: ["available_slots"] });
      queryClient.invalidateQueries({ queryKey: ["member_hours"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["points_transactions"] });
    },
  });
}

export function useRejectBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ bookingId, rejectMessage }: { bookingId: string; rejectMessage?: string }) => {
      const res = await supabase.functions.invoke("calendar-sync", {
        body: { action: "reject_booking", booking_id: bookingId, reject_message: rejectMessage || "" },
      });
      if (res.error) throw new Error(res.error.message || "Rejection failed");
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all_bookings"] });
      queryClient.invalidateQueries({ queryKey: ["my_bookings"] });
      queryClient.invalidateQueries({ queryKey: ["available_slots"] });
      queryClient.invalidateQueries({ queryKey: ["member_hours"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useAdminCancelBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await supabase.functions.invoke("calendar-sync", {
        body: { action: "admin_cancel_booking", booking_id: bookingId },
      });
      if (res.error) throw new Error(res.error.message || "Cancellation failed");
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all_bookings"] });
      queryClient.invalidateQueries({ queryKey: ["my_bookings"] });
      queryClient.invalidateQueries({ queryKey: ["available_slots"] });
      queryClient.invalidateQueries({ queryKey: ["member_hours"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["user_hours_balance"] });
      queryClient.invalidateQueries({ queryKey: ["hours_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["revenue_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["revenue_summary"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useMyBookings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my_bookings"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("user_id", user!.id)
        .order("start_time", { ascending: false });
      if (error) throw error;

      // Enrich with bay name
      const bayIds = [...new Set((data ?? []).map((b: any) => b.bay_id).filter(Boolean))];
      let bayMap = new Map<string, string>();
      if (bayIds.length > 0) {
        const { data: bays } = await supabase.from("bays").select("id, name").in("id", bayIds);
        bayMap = new Map((bays ?? []).map((b: any) => [b.id, b.name]));
      }

      return (data ?? []).map((b: any) => ({
        ...b,
        bay_name: bayMap.get(b.bay_id) || null,
      }));
    },
  });
}

export function useAllBookings() {
  return useQuery({
    queryKey: ["all_bookings"],
    queryFn: async () => {
      const { data: bookings, error } = await supabase
        .from("bookings")
        .select("*")
        .order("start_time", { ascending: false });
      if (error) throw error;

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, user_id, display_name, email, user_type");

      // Dual-key map: index by both user_id (auth ID) and profile id (primary key)
      // so admin-registered / guest users without auth accounts are found too
      const profileMap = new Map<string, any>();
      for (const p of profiles ?? []) {
        if (p.user_id) profileMap.set(p.user_id, p);
        profileMap.set(p.id, p);
      }

      // Get bay names
      const bayIds = [...new Set((bookings ?? []).map((b: any) => b.bay_id).filter(Boolean))];
      let bayMap = new Map<string, string>();
      if (bayIds.length > 0) {
        const { data: bays } = await supabase.from("bays").select("id, name").in("id", bayIds);
        bayMap = new Map((bays ?? []).map((b: any) => [b.id, b.name]));
      }

      return (bookings ?? []).map((b: any) => ({
        ...b,
        display_name: profileMap.get(b.user_id)?.display_name || "Unknown",
        email: profileMap.get(b.user_id)?.email || "",
        user_type: profileMap.get(b.user_id)?.user_type || "non-registered",
        bay_name: bayMap.get(b.bay_id) || null,
      }));
    },
  });
}

export function useUserHoursBalance() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user_hours_balance", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Derive all values from transactions as the single source of truth
      const { data: txns, error } = await supabase
        .from("hours_transactions")
        .select("type, hours")
        .eq("user_id", user!.id);
      if (error) throw error;

      let purchased = 0;
      let used = 0;

      for (const t of txns ?? []) {
        if (t.type === "purchase" || t.type === "credit") {
          purchased += Number(t.hours);
        } else if (t.type === "adjustment" || t.type === "refund") {
          // Adjustments and refunds reduce the used total
          used -= Number(t.hours);
        } else {
          // deduction
          used += Number(t.hours);
        }
      }

      // Ensure used doesn't go negative from adjustments
      used = Math.max(0, used);
      const remaining = purchased - used;

      return { purchased, used, remaining };
    },
  });
}

export function useUserProfile() {
  const { user, loading } = useAuth();
  return useQuery({
    queryKey: ["user_profile", user?.id],
    enabled: !!user && !loading,
    retry: 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdatePreferredCity() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (city: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({ preferred_city: city })
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user_profile"] });
    },
  });
}
