import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Google Calendar API helpers
async function getAccessToken(serviceAccountKey: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      iss: serviceAccountKey.client_email,
      scope: "https://www.googleapis.com/auth/calendar",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );

  // Import private key and sign
  const pemContents = serviceAccountKey.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signInput = new TextEncoder().encode(`${header}.${payload}`);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, signInput);
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${header}.${payload}.${signatureB64}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(`Token error: ${JSON.stringify(tokenData)}`);
  return tokenData.access_token;
}

async function listEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
) {
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
  );
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "250");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Calendar list error: ${JSON.stringify(data)}`);
  return data.items || [];
}

async function createEvent(
  accessToken: string,
  calendarId: string,
  summary: string,
  startTime: string,
  endTime: string,
  description?: string
) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary,
        description,
        start: { dateTime: startTime },
        end: { dateTime: endTime },
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Calendar create error: ${JSON.stringify(data)}`);
  return data;
}

async function deleteEvent(accessToken: string, calendarId: string, eventId: string) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok && res.status !== 404) {
    const data = await res.text();
    throw new Error(`Calendar delete error [${res.status}]: ${data}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const serviceAccountKeyStr = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (!serviceAccountKeyStr) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY not configured");

    let serviceAccountKey: any;
    try {
      serviceAccountKey = JSON.parse(serviceAccountKeyStr);
    } catch (parseErr) {
      console.error("Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY. Length:", serviceAccountKeyStr.length, "First 20 chars:", serviceAccountKeyStr.substring(0, 20));
      return new Response(
        JSON.stringify({ error: "Server configuration error: The Google Service Account Key is not valid JSON. Please re-enter the secret with the raw JSON content from your .json key file." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const { action, ...params } = await req.json();
    const accessToken = await getAccessToken(serviceAccountKey);

    if (action === "list_slots") {
      const { calendar_email, date, open_time, close_time } = params;
      const timeMin = `${date}T${open_time}:00+05:30`;
      const timeMax = `${date}T${close_time}:00+05:30`;

      const events = await listEvents(accessToken, calendar_email, timeMin, timeMax);

      // Build busy intervals
      const busy: { start: number; end: number }[] = events.map((e: any) => ({
        start: new Date(e.start.dateTime || e.start.date).getTime(),
        end: new Date(e.end.dateTime || e.end.date).getTime(),
      }));

      // Generate all 30-min slots within operating hours
      const dayStart = new Date(`${date}T${open_time}:00+05:30`).getTime();
      const dayEnd = new Date(`${date}T${close_time}:00+05:30`).getTime();
      const slots: { time: string; available: boolean }[] = [];

      for (let t = dayStart; t < dayEnd; t += 30 * 60 * 1000) {
        const slotEnd = t + 30 * 60 * 1000;
        const isBusy = busy.some((b) => t < b.end && slotEnd > b.start);
        slots.push({
          time: new Date(t).toISOString(),
          available: !isBusy,
        });
      }

      return new Response(JSON.stringify({ slots }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create_booking") {
      const { calendar_email, start_time, end_time, duration_minutes, city, display_name } = params;

      // Check balance
      const { data: hours } = await supabase
        .from("member_hours")
        .select("*")
        .eq("user_id", userId)
        .single();

      const hoursNeeded = duration_minutes / 60;
      const remaining = (hours?.hours_purchased ?? 0) - (hours?.hours_used ?? 0);

      if (remaining < hoursNeeded) {
        return new Response(
          JSON.stringify({ error: `Insufficient hours. You have ${remaining}h, need ${hoursNeeded}h.` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check no overlap with existing bookings
      const { data: existingBookings } = await supabase
        .from("bookings")
        .select("*")
        .eq("city", city)
        .eq("status", "confirmed")
        .gte("end_time", start_time)
        .lte("start_time", end_time);

      if (existingBookings && existingBookings.length > 0) {
        return new Response(
          JSON.stringify({ error: "This slot is no longer available. Please refresh and try again." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create calendar event
      const calEvent = await createEvent(
        accessToken,
        calendar_email,
        `Bay Booking - ${display_name || "Member"}`,
        start_time,
        end_time,
        `Booked by ${display_name || "Member"} via EdgeCollective`
      );

      // Create booking record
      const { data: booking, error: bookingError } = await supabase.from("bookings").insert({
        user_id: userId,
        city,
        start_time,
        end_time,
        duration_minutes,
        status: "confirmed",
        calendar_event_id: calEvent.id,
      }).select().single();

      if (bookingError) throw bookingError;

      // Deduct hours
      await supabase
        .from("member_hours")
        .update({ hours_used: (hours?.hours_used ?? 0) + hoursNeeded })
        .eq("user_id", userId);

      // Log transaction
      await supabase.from("hours_transactions").insert({
        user_id: userId,
        type: "deduction",
        hours: hoursNeeded,
        note: `Bay booking - ${city} - ${new Date(start_time).toLocaleDateString()}`,
        created_by: userId,
      });

      // Notification
      await supabase.from("notifications").insert({
        user_id: userId,
        title: "Bay Booked!",
        message: `Your bay in ${city} has been booked for ${new Date(start_time).toLocaleString()} (${hoursNeeded}h). ${remaining - hoursNeeded}h remaining.`,
        type: "booking",
      });

      // Low balance warning
      const newRemaining = remaining - hoursNeeded;
      if (newRemaining <= 2 && newRemaining > 0) {
        await supabase.from("notifications").insert({
          user_id: userId,
          title: "⚠️ Low Hours Balance",
          message: `You have only ${newRemaining}h remaining. Consider purchasing more hours.`,
          type: "warning",
        });
      }

      // Email notification is handled client-side via sendNotificationEmail

      return new Response(JSON.stringify({ booking }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "cancel_booking") {
      const { booking_id } = params;

      const { data: booking } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", booking_id)
        .eq("user_id", userId)
        .single();

      if (!booking) {
        return new Response(JSON.stringify({ error: "Booking not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check 24h cancellation policy
      const hoursUntil = (new Date(booking.start_time).getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntil < 24) {
        return new Response(
          JSON.stringify({ error: "Cancellations must be made at least 24 hours in advance." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get bay config for calendar email
      const { data: bayConfig } = await supabase
        .from("bay_config")
        .select("calendar_email")
        .eq("city", booking.city)
        .single();

      // Delete calendar event
      if (booking.calendar_event_id && bayConfig?.calendar_email) {
        try {
          await deleteEvent(accessToken, bayConfig.calendar_email, booking.calendar_event_id);
        } catch (e) {
          console.error("Failed to delete calendar event:", e);
        }
      }

      // Update booking status
      await supabase
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", booking_id);

      // Refund hours
      const hoursToRefund = booking.duration_minutes / 60;
      const { data: memberHours } = await supabase
        .from("member_hours")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (memberHours) {
        await supabase
          .from("member_hours")
          .update({ hours_used: Math.max(0, memberHours.hours_used - hoursToRefund) })
          .eq("user_id", userId);
      }

      // Log refund transaction
      await supabase.from("hours_transactions").insert({
        user_id: userId,
        type: "adjustment",
        hours: hoursToRefund,
        note: `Cancellation refund - ${booking.city} - ${new Date(booking.start_time).toLocaleDateString()}`,
        created_by: userId,
      });

      // Notification
      await supabase.from("notifications").insert({
        user_id: userId,
        title: "Booking Cancelled",
        message: `Your bay booking in ${booking.city} on ${new Date(booking.start_time).toLocaleString()} has been cancelled. ${hoursToRefund}h refunded.`,
        type: "booking",
      });

      // Send cancellation email
      try {
        const emailSupabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        await emailSupabase.functions.invoke("send-notification-email", {
          body: {
            user_id: userId,
            template: "booking_cancelled",
            subject: "Booking Cancelled",
            data: {
              city: booking.city,
              date: new Date(booking.start_time).toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
              hours_refunded: hoursToRefund,
            },
          },
        });
      } catch (emailErr) {
        console.error("Email send failed (non-blocking):", emailErr);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Calendar sync error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
