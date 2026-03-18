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
  timeZone: string,
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
        start: { dateTime: startTime, timeZone },
        end: { dateTime: endTime, timeZone },
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Calendar create error: ${JSON.stringify(data)}`);
  return data;
}

async function updateEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  summary: string,
  description?: string
) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ summary, description }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Calendar update error: ${JSON.stringify(data)}`);
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

function createAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// Fetch the calendar's timezone from Google Calendar API
async function getCalendarTimezone(accessToken: string, calendarId: string): Promise<string> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();
    if (res.ok && data.timeZone) return data.timeZone;
  } catch (e) {
    console.error("Failed to fetch calendar timezone:", e);
  }
  return "UTC"; // fallback
}

function formatDate(dateStr: string, tz: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", { timeZone: tz, weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function formatTime(dateStr: string, tz: string): string {
  return new Date(dateStr).toLocaleTimeString("en-IN", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
}

function formatTimeRange(start: string, end: string, tz: string): string {
  return `${formatTime(start, tz)} – ${formatTime(end, tz)}`;
}

function formatDateTime(dateStr: string, tz: string): string {
  return new Date(dateStr).toLocaleString("en-IN", { timeZone: tz });
}

function formatShortDate(dateStr: string, tz: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", { timeZone: tz });
}

// Build IANA-offset string for a given date in a given timezone (e.g. "+05:30")
function getUtcOffsetForTz(date: string, tz: string): string {
  const d = new Date(date);
  // Format with timezone to get offset
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(d);
  const offsetPart = parts.find(p => p.type === "timeZoneName");
  if (offsetPart) {
    // Format is like "GMT+5:30" or "GMT-8" — normalize to "+05:30"
    const match = offsetPart.value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (match) {
      const sign = match[1];
      const hrs = match[2].padStart(2, "0");
      const mins = (match[3] || "00").padStart(2, "0");
      return `${sign}${hrs}:${mins}`;
    }
  }
  return "+00:00";
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

      // Get the calendar's actual timezone
      const calTz = await getCalendarTimezone(accessToken, calendar_email);
      const offset = getUtcOffsetForTz(`${date}T${open_time}:00`, calTz);

      const timeMin = `${date}T${open_time}:00${offset}`;
      const timeMax = `${date}T${close_time}:00${offset}`;

      const events = await listEvents(accessToken, calendar_email, timeMin, timeMax);

      const busy: { start: number; end: number }[] = events.map((e: any) => ({
        start: new Date(e.start.dateTime || e.start.date).getTime(),
        end: new Date(e.end.dateTime || e.end.date).getTime(),
      }));

      const dayStart = new Date(`${date}T${open_time}:00${offset}`).getTime();
      const dayEnd = new Date(`${date}T${close_time}:00${offset}`).getTime();
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
      const { calendar_email, start_time, end_time, duration_minutes, city, bay_id, bay_name, display_name, session_type } = params;

      // Get the calendar's timezone for consistent formatting
      const calTz = await getCalendarTimezone(accessToken, calendar_email);

      // Get bay config for coaching mode
      let coachingMode = "instant";
      let coachingHours = 1;
      if (bay_id) {
        const { data: bayData } = await supabase.from("bays").select("coaching_mode, coaching_hours").eq("id", bay_id).single();
        if (bayData) {
          coachingMode = bayData.coaching_mode || "instant";
          coachingHours = bayData.coaching_hours || 1;
        }
      }

      const isCoaching = session_type === "coaching";
      const needsApproval = isCoaching && coachingMode === "approval_required";
      const hoursNeeded = isCoaching ? coachingHours : duration_minutes / 60;

      // Only check/deduct balance for non-pending bookings
      if (!needsApproval) {
        const { data: hours } = await supabase
          .from("member_hours")
          .select("*")
          .eq("user_id", userId)
          .single();

        const remaining = (hours?.hours_purchased ?? 0) - (hours?.hours_used ?? 0);
        if (remaining < hoursNeeded) {
          return new Response(
            JSON.stringify({ error: `Insufficient hours. You have ${remaining}h, need ${hoursNeeded}h.` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Check no overlap with existing bookings for this specific bay (both confirmed and pending block slots)
      const overlapQuery = supabase
        .from("bookings")
        .select("*")
        .in("status", ["confirmed", "pending"])
        .gte("end_time", start_time)
        .lte("start_time", end_time);

      if (bay_id) {
        overlapQuery.eq("bay_id", bay_id);
      } else {
        overlapQuery.eq("city", city);
      }

      const { data: existingBookings } = await overlapQuery;

      if (existingBookings && existingBookings.length > 0) {
        return new Response(
          JSON.stringify({ error: "This slot is no longer available. Please refresh and try again." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Create calendar event
      const bayLabel = bay_name || city;
      const calSummary = needsApproval
        ? `⏳ Pending Coaching Approval - ${display_name || "Member"}`
        : `${bayLabel} - ${display_name || "Member"}${isCoaching ? " (Coaching)" : ""}`;
      const calDesc = needsApproval
        ? `Pending coaching approval for ${display_name || "Member"} via Golfer's Edge`
        : `Booked by ${display_name || "Member"} via Golfer's Edge${isCoaching ? " - Coaching Session" : ""}`;

      const calEvent = await createEvent(accessToken, calendar_email, calSummary, start_time, end_time, calTz, calDesc);

      // Create booking record
      const bookingStatus = needsApproval ? "pending" : "confirmed";
      const bookingInsert: any = {
        user_id: userId,
        city,
        start_time,
        end_time,
        duration_minutes,
        status: bookingStatus,
        calendar_event_id: calEvent.id,
        session_type: session_type || "practice",
      };
      if (bay_id) bookingInsert.bay_id = bay_id;

      const { data: booking, error: bookingError } = await supabase.from("bookings").insert(bookingInsert).select().single();
      if (bookingError) throw bookingError;

      // Deduct hours only for instant bookings
      if (!needsApproval) {
        const { data: hours } = await supabase
          .from("member_hours")
          .select("*")
          .eq("user_id", userId)
          .single();

        await supabase
          .from("member_hours")
          .update({ hours_used: (hours?.hours_used ?? 0) + hoursNeeded })
          .eq("user_id", userId);

        await supabase.from("hours_transactions").insert({
          user_id: userId,
          type: "deduction",
          hours: hoursNeeded,
          note: `${isCoaching ? "Coaching" : "Bay"} booking - ${bayLabel} - ${formatShortDate(start_time, calTz)}`,
          created_by: userId,
        });

        const remaining = (hours?.hours_purchased ?? 0) - (hours?.hours_used ?? 0) - hoursNeeded;

        await supabase.from("notifications").insert({
          user_id: userId,
          title: isCoaching ? "Coaching Booked!" : "Bay Booked!",
          message: `Your ${bayLabel} ${isCoaching ? "coaching session" : "bay"} has been booked for ${formatDateTime(start_time, calTz)} (${hoursNeeded}h). ${remaining}h remaining.`,
          type: "booking",
        });

        if (remaining <= 2 && remaining > 0) {
          await supabase.from("notifications").insert({
            user_id: userId,
            title: "⚠️ Low Hours Balance",
            message: `You have only ${remaining}h remaining. Consider purchasing more hours.`,
            type: "warning",
          });
        }
        // Send confirmed booking email
        try {
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              user_id: userId,
              template: "booking_confirmed",
              subject: "✅ Bay Booking Confirmed!",
              data: {
                city,
                bay: bayLabel,
                date: formatDate(start_time, calTz),
                time: formatTimeRange(start_time, end_time, calTz),
                duration: `${hoursNeeded}h`,
                hours_remaining: `${remaining}h`,
              },
            }),
          });
        } catch (e) {
          console.error("Failed to send booking confirmation email:", e);
        }
      } else {
        // Pending coaching notification
        await supabase.from("notifications").insert({
          user_id: userId,
          title: "🕐 Coaching Pending Approval",
          message: `Your coaching session at ${bayLabel} on ${formatDateTime(start_time, calTz)} is awaiting admin approval.`,
          type: "booking",
        });

        // Notify admins
        const adminClient = createAdminClient();
        const { data: adminRoles } = await adminClient.from("user_roles").select("user_id").eq("role", "admin");
        for (const admin of adminRoles ?? []) {
          await adminClient.from("notifications").insert({
            user_id: admin.user_id,
            title: "📋 New Coaching Request",
            message: `${display_name || "A member"} has requested a coaching session at ${bayLabel} on ${formatDateTime(start_time, calTz)}. Please approve or reject.`,
            type: "admin",
          });
        }

        // Send pending coaching email
        try {
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              user_id: userId,
              template: "coaching_pending",
              subject: "🕐 Coaching Session Pending Approval",
              data: {
                city,
                bay: bayLabel,
                date: formatDate(start_time, calTz),
                time: formatTimeRange(start_time, end_time, calTz),
                duration: `${duration_minutes / 60}h`,
              },
            }),
          });
        } catch (e) {
          console.error("Failed to send pending coaching email:", e);
        }
      }

      return new Response(JSON.stringify({ booking }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "approve_booking") {
      const { booking_id } = params;

      // Check admin role
      const adminClient = createAdminClient();
      const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: userId, _role: "admin" });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: booking } = await adminClient
        .from("bookings")
        .select("*")
        .eq("id", booking_id)
        .eq("status", "pending")
        .single();

      if (!booking) {
        return new Response(JSON.stringify({ error: "Pending booking not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get bay info for coaching hours
      let coachingHours = 1;
      let calendarEmail: string | null = null;
      let bayName = booking.city;
      if (booking.bay_id) {
        const { data: bay } = await adminClient.from("bays").select("coaching_hours, calendar_email, name").eq("id", booking.bay_id).single();
        if (bay) {
          coachingHours = bay.coaching_hours || 1;
          calendarEmail = bay.calendar_email;
          bayName = bay.name || booking.city;
        }
      }

      // Get the calendar's timezone for consistent formatting
      const calTz = calendarEmail ? await getCalendarTimezone(accessToken, calendarEmail) : "UTC";

      const hoursNeeded = booking.session_type === "coaching" ? coachingHours : booking.duration_minutes / 60;

      // Check balance
      const { data: hours } = await adminClient
        .from("member_hours")
        .select("*")
        .eq("user_id", booking.user_id)
        .single();

      const remaining = (hours?.hours_purchased ?? 0) - (hours?.hours_used ?? 0);
      if (remaining < hoursNeeded) {
        return new Response(
          JSON.stringify({ error: `User has insufficient hours (${remaining}h available, ${hoursNeeded}h needed).` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update booking status
      await adminClient.from("bookings").update({ status: "confirmed" }).eq("id", booking_id);

      // Deduct hours
      await adminClient
        .from("member_hours")
        .update({ hours_used: (hours?.hours_used ?? 0) + hoursNeeded })
        .eq("user_id", booking.user_id);

      await adminClient.from("hours_transactions").insert({
        user_id: booking.user_id,
        type: "deduction",
        hours: hoursNeeded,
        note: `Coaching approved - ${bayName} - ${formatShortDate(booking.start_time, calTz)}`,
        created_by: userId,
      });

      // Update calendar event title
      if (booking.calendar_event_id && calendarEmail) {
        try {
          const { data: profile } = await adminClient.from("profiles").select("display_name").eq("user_id", booking.user_id).single();
          const displayName = profile?.display_name || "Member";
          await updateEvent(
            accessToken,
            calendarEmail,
            booking.calendar_event_id,
            `${bayName} - ${displayName} (Coaching)`,
            `Coaching session for ${displayName} - Approved`
          );
        } catch (e) {
          console.error("Failed to update calendar event:", e);
        }
      }

      // Notify user
      const newRemaining = remaining - hoursNeeded;
      await adminClient.from("notifications").insert({
        user_id: booking.user_id,
        title: "✅ Coaching Approved!",
        message: `Your coaching session at ${bayName} on ${formatDateTime(booking.start_time, calTz)} has been approved. ${hoursNeeded}h deducted. ${newRemaining}h remaining.`,
        type: "booking",
      });

      // Send approval email
      try {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            user_id: booking.user_id,
            template: "coaching_approved",
            subject: "✅ Coaching Session Approved!",
            data: {
              bay: bayName,
              city: booking.city,
              date: formatDate(booking.start_time, calTz),
              time: formatTimeRange(booking.start_time, booking.end_time, calTz),
              hours_deducted: `${hoursNeeded}h`,
              hours_remaining: `${newRemaining}h`,
            },
          }),
        });
      } catch (e) {
        console.error("Failed to send approval email:", e);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "reject_booking") {
      const { booking_id, reject_message } = params;

      const adminClient = createAdminClient();
      const { data: isAdmin } = await adminClient.rpc("has_role", { _user_id: userId, _role: "admin" });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: booking } = await adminClient
        .from("bookings")
        .select("*")
        .eq("id", booking_id)
        .eq("status", "pending")
        .single();

      if (!booking) {
        return new Response(JSON.stringify({ error: "Pending booking not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get calendar email
      let calendarEmail: string | null = null;
      let bayName = booking.city;
      if (booking.bay_id) {
        const { data: bay } = await adminClient.from("bays").select("calendar_email, name").eq("id", booking.bay_id).single();
        if (bay) {
          calendarEmail = bay.calendar_email;
          bayName = bay.name || booking.city;
        }
      }

      // Get the calendar's timezone for consistent formatting
      const calTz = calendarEmail ? await getCalendarTimezone(accessToken, calendarEmail) : "UTC";

      // Delete calendar event to free slot
      if (booking.calendar_event_id && calendarEmail) {
        try {
          await deleteEvent(accessToken, calendarEmail, booking.calendar_event_id);
        } catch (e) {
          console.error("Failed to delete calendar event:", e);
        }
      }

      // Update booking status with optional note
      const updateData: Record<string, string> = { status: "rejected" };
      if (reject_message) updateData.note = reject_message;
      await adminClient.from("bookings").update(updateData).eq("id", booking_id);

      // Notify user
      const noteText = reject_message ? ` Admin note: ${reject_message}` : "";
      await adminClient.from("notifications").insert({
        user_id: booking.user_id,
        title: "❌ Coaching Request Rejected",
        message: `Your coaching session request at ${bayName} on ${formatDateTime(booking.start_time, calTz)} has been declined. No hours were deducted.${noteText}`,
        type: "booking",
      });

      // Send rejection email
      try {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            user_id: booking.user_id,
            template: "coaching_rejected",
            subject: "❌ Coaching Session Declined",
            data: {
              bay: bayName,
              city: booking.city,
              date: formatDate(booking.start_time, calTz),
              time: formatTimeRange(booking.start_time, booking.end_time, calTz),
              admin_note: reject_message || "",
            },
          }),
        });
      } catch (e) {
        console.error("Failed to send rejection email:", e);
      }

      return new Response(JSON.stringify({ success: true }), {
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

      // Check 24h cancellation policy (applies to confirmed bookings)
      if (booking.status === "confirmed") {
        const hoursUntil = (new Date(booking.start_time).getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursUntil < 24) {
          return new Response(
            JSON.stringify({ error: "Cancellations must be made at least 24 hours in advance." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Get calendar email, bay name, and coaching hours
      const adminClient = createAdminClient();
      let calendarEmail: string | null = null;
      let bayName = booking.city;
      let coachingHours = 1;
      if (booking.bay_id) {
        const { data: bay } = await supabase.from("bays").select("calendar_email, name, coaching_hours").eq("id", booking.bay_id).single();
        if (bay) {
          calendarEmail = bay.calendar_email || null;
          bayName = bay.name || booking.city;
          coachingHours = bay.coaching_hours || 1;
        }
      }
      if (!calendarEmail) {
        const { data: bayConfig } = await supabase.from("bay_config").select("calendar_email").eq("city", booking.city).single();
        calendarEmail = bayConfig?.calendar_email || null;
      }

      // Get the calendar's timezone for consistent formatting
      const calTz = calendarEmail ? await getCalendarTimezone(accessToken, calendarEmail) : "UTC";

      // Delete calendar event
      if (booking.calendar_event_id && calendarEmail) {
        try {
          await deleteEvent(accessToken, calendarEmail, booking.calendar_event_id);
        } catch (e) {
          console.error("Failed to delete calendar event:", e);
        }
      }

      // Update booking status (use adminClient to ensure it works)
      await adminClient
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", booking_id);

      // Refund hours only if was confirmed (pending bookings never had hours deducted)
      let hoursRefunded = 0;
      if (booking.status === "confirmed") {
        const isCoaching = booking.session_type === "coaching";
        const hoursToRefund = isCoaching ? coachingHours : booking.duration_minutes / 60;
        hoursRefunded = hoursToRefund;

        const { data: memberHours } = await adminClient
          .from("member_hours")
          .select("*")
          .eq("user_id", userId)
          .single();

        if (memberHours) {
          await adminClient
            .from("member_hours")
            .update({ hours_used: Math.max(0, memberHours.hours_used - hoursToRefund) })
            .eq("user_id", userId);
        }

        await adminClient.from("hours_transactions").insert({
          user_id: userId,
          type: "refund",
          hours: hoursToRefund,
          note: `Cancellation refund - ${bayName} - ${formatShortDateIST(booking.start_time)}`,
          created_by: userId,
        });
      }

      // User notification
      await adminClient.from("notifications").insert({
        user_id: userId,
        title: "Booking Cancelled",
        message: `Your ${booking.session_type === "coaching" ? "coaching" : "bay"} booking at ${bayName} on ${formatDateTimeIST(booking.start_time)} has been cancelled.${hoursRefunded > 0 ? ` ${hoursRefunded}h refunded.` : ""}`,
        type: "booking",
      });

      // Admin notifications
      const { data: adminRoles } = await adminClient.from("user_roles").select("user_id").eq("role", "admin");
      const { data: userProfile } = await adminClient.from("profiles").select("display_name").eq("user_id", userId).single();
      const displayName = userProfile?.display_name || "A member";
      for (const admin of adminRoles ?? []) {
        if (admin.user_id !== userId) {
          await adminClient.from("notifications").insert({
            user_id: admin.user_id,
            title: "🚫 Booking Cancelled",
            message: `${displayName} cancelled their ${booking.session_type === "coaching" ? "coaching" : "bay"} booking at ${bayName} on ${formatDateTimeIST(booking.start_time)}.${hoursRefunded > 0 ? ` ${hoursRefunded}h refunded.` : ""}`,
            type: "admin",
          });
        }
      }

      // Send cancellation email
      try {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            user_id: userId,
            template: "booking_cancelled",
            subject: "🚫 Booking Cancelled",
            data: {
              bay: bayName,
              city: booking.city,
              date: formatDateIST(booking.start_time),
              hours_refunded: hoursRefunded,
            },
          }),
        });
      } catch (e) {
        console.error("Failed to send cancellation email:", e);
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
