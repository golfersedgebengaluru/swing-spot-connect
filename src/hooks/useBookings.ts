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
    }) => {
      const profile = await supabase
        .from("profiles")
        .select("display_name")
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
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["available_slots"] });
      queryClient.invalidateQueries({ queryKey: ["my_bookings"] });
      queryClient.invalidateQueries({ queryKey: ["member_hours"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["user_hours_balance"] });
      queryClient.invalidateQueries({ queryKey: ["hours_transactions"] });
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
    },
  });
}

export function useApproveBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await supabase.functions.invoke("calendar-sync", {
        body: { action: "approve_booking", booking_id: bookingId },
      });
      if (res.error) throw new Error(res.error.message || "Approval failed");
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
        .select("user_id, display_name, email");

      const profileMap = new Map(
        (profiles ?? []).map((p) => [p.user_id, p])
      );

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
        } else if (t.type === "adjustment") {
          // Adjustments (refunds) reduce the used total
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
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user_profile", user?.id],
    enabled: !!user,
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
