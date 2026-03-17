import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { sendNotificationEmail } from "@/hooks/useNotificationEmail";

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

export function useAvailableSlots(calendarEmail: string | undefined, date: string | undefined, openTime: string | undefined, closeTime: string | undefined) {
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
    refetchInterval: 30000, // Refresh every 30s
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
    onSuccess: (_data, variables) => {
      // Send booking confirmation email with properly formatted data
      if (user) {
        const startDate = new Date(variables.start_time);
        const endDate = new Date(variables.end_time);
        const hoursNeeded = variables.duration_minutes / 60;
        sendNotificationEmail({
          user_id: user.id,
          template: "booking_confirmed",
          subject: "✅ Bay Booking Confirmed!",
          data: {
            city: variables.city,
            date: startDate.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
            time: `${startDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} – ${endDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`,
            duration: `${hoursNeeded}h`,
            hours_remaining: _data?.booking ? "—" : "—",
          },
        });
      }
      queryClient.invalidateQueries({ queryKey: ["available_slots"] });
      queryClient.invalidateQueries({ queryKey: ["my_bookings"] });
      queryClient.invalidateQueries({ queryKey: ["member_hours"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
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
      return data as any[];
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

      return (bookings ?? []).map((b: any) => ({
        ...b,
        display_name: profileMap.get(b.user_id)?.display_name || "Unknown",
        email: profileMap.get(b.user_id)?.email || "",
      }));
    },
  });
}

export function useUserHoursBalance() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["user_hours_balance"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("member_hours")
        .select("hours_purchased, hours_used")
        .eq("user_id", user!.id)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      if (!data) return { purchased: 0, used: 0, remaining: 0 };
      return {
        purchased: data.hours_purchased,
        used: data.hours_used,
        remaining: data.hours_purchased - data.hours_used,
      };
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
