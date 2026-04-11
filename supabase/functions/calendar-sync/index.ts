import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Job failure logging is handled via console.error throughout the function

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

// Get admin + city-scoped site-admin user IDs for notifications
async function getAdminAndSiteAdminIds(adminClient: any, city: string, excludeUserId?: string): Promise<string[]> {
  // Get all admins
  const { data: adminRoles } = await adminClient.from("user_roles").select("user_id").eq("role", "admin");
  // Get site_admins assigned to this city
  const { data: siteAdminCities } = await adminClient.from("site_admin_cities").select("user_id").eq("city", city);
  
  const ids = new Set<string>();
  for (const a of adminRoles ?? []) ids.add(a.user_id);
  for (const s of siteAdminCities ?? []) ids.add(s.user_id);
  
  if (excludeUserId) ids.delete(excludeUserId);
  return [...ids];
}

// Send admin email notification to all relevant admins/site-admins
async function notifyAdmins(adminClient: any, adminIds: string[], template: string, subject: string, data: Record<string, any>) {
  for (const adminId of adminIds) {
    try {
      // Dual-key profile lookup: try user_id first, then id
      let adminProfile: any = null;
      const { data: byUserId } = await adminClient.from("profiles").select("display_name").eq("user_id", adminId).single();
      adminProfile = byUserId;
      if (!adminProfile) {
        const { data: byId } = await adminClient.from("profiles").select("display_name").eq("id", adminId).single();
        adminProfile = byId;
      }
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          user_id: adminId,
          template,
          subject,
          data: { ...data, admin_name: adminProfile?.display_name || "Admin" },
        }),
      });
    } catch (e) {
      console.error(`Failed to send admin email to ${adminId}:`, (e as Error).message);
    }
  }
}

// Send in-app notification to all relevant admins/site-admins
async function notifyAdminsInApp(adminClient: any, adminIds: string[], title: string, message: string, actionUrl?: string) {
  for (const adminId of adminIds) {
    await adminClient.from("notifications").insert({
      user_id: adminId,
      title,
      message,
      type: "admin",
      ...(actionUrl ? { action_url: actionUrl } : {}),
    });
  }
}

// ─── Revenue reversal + Invoice cancellation + Credit note ───
// Called when a confirmed booking with paid revenue (amount > 0) is cancelled.
async function reverseRevenueAndInvoice(adminClient: any, bookingId: string) {
  try {
    // 1. Find the original revenue transaction with actual payment (amount > 0)
    const { data: revTx } = await adminClient
      .from("revenue_transactions")
      .select("*")
      .eq("booking_id", bookingId)
      .gt("amount", 0)
      .eq("status", "confirmed")
      .neq("transaction_type", "refund")
      .maybeSingle();

    if (!revTx) return; // No paid revenue to reverse (hour-based booking)

    // GUARD: Only auto-reverse for gateway-originated transactions (guest_booking, payment).
    // Manual invoice transactions (booking, purchase) are managed by admins directly.
    if (revTx.transaction_type === "booking" || revTx.transaction_type === "purchase") {
      console.log(`Skipping auto-reversal for manual invoice transaction (type: ${revTx.transaction_type}) on booking ${bookingId}`);
      return;
    }

    // 2. Create a refund revenue transaction (reversal)
    await adminClient.from("revenue_transactions").insert({
      transaction_type: "refund",
      amount: revTx.amount,
      currency: revTx.currency,
      user_id: revTx.user_id || null,
      booking_id: bookingId,
      original_transaction_id: revTx.id,
      guest_name: revTx.guest_name,
      guest_email: revTx.guest_email,
      guest_phone: revTx.guest_phone,
      gateway_name: revTx.gateway_name,
      description: `Refund - ${revTx.description || "Booking cancelled"}`,
      status: "confirmed",
      city: revTx.city,
    });

    // 3. Find the linked invoice
    const { data: invoice } = await adminClient
      .from("invoices")
      .select("*")
      .eq("revenue_transaction_id", revTx.id)
      .eq("invoice_type", "invoice")
      .neq("status", "cancelled")
      .maybeSingle();

    if (!invoice) {
      // Try finding by booking_id match via revenue_transaction
      // If no invoice found, nothing more to do
      return;
    }

    // 4. Cancel the invoice
    await adminClient
      .from("invoices")
      .update({ status: "cancelled" })
      .eq("id", invoice.id);

    // 5. Get active financial year for credit note numbering
    const { data: fy } = await adminClient
      .from("financial_years")
      .select("*")
      .eq("is_active", true)
      .is("city", null)
      .maybeSingle();

    // Try city-specific FY first
    let effectiveFy = fy;
    if (invoice.city) {
      const { data: cityFy } = await adminClient
        .from("financial_years")
        .select("*")
        .eq("is_active", true)
        .eq("city", invoice.city)
        .maybeSingle();
      if (cityFy) effectiveFy = cityFy;
    }

    if (!effectiveFy) {
      console.error("No active financial year for credit note generation");
      return;
    }

    // 6. Get next credit note number
    const { data: cnNumber } = await adminClient.rpc("get_next_invoice_number", {
      p_gstin: invoice.business_gstin,
      p_fy_id: effectiveFy.id,
      p_prefix: "CN",
      p_start: 1,
    });

    if (!cnNumber) {
      console.error("Failed to generate credit note number");
      return;
    }

    // 7. Create credit note
    const { data: creditNote, error: cnErr } = await adminClient
      .from("invoices")
      .insert({
        invoice_number: cnNumber,
        invoice_date: new Date().toISOString().split("T")[0],
        financial_year_id: effectiveFy.id,
        customer_user_id: invoice.customer_user_id,
        customer_name: invoice.customer_name,
        customer_email: invoice.customer_email,
        customer_phone: invoice.customer_phone,
        customer_gstin: invoice.customer_gstin,
        customer_state: invoice.customer_state,
        customer_state_code: invoice.customer_state_code,
        business_name: invoice.business_name,
        business_gstin: invoice.business_gstin,
        business_address: invoice.business_address,
        business_state: invoice.business_state,
        business_state_code: invoice.business_state_code,
        subtotal: invoice.subtotal,
        cgst_total: invoice.cgst_total,
        sgst_total: invoice.sgst_total,
        igst_total: invoice.igst_total,
        total: invoice.total,
        status: "issued",
        invoice_type: "credit_note",
        credit_note_for: invoice.id,
        payment_method: invoice.payment_method,
        city: invoice.city,
      })
      .select()
      .single();

    if (cnErr) {
      console.error("Failed to create credit note:", cnErr);
      return;
    }

    // 8. Copy line items to credit note
    const { data: lineItems } = await adminClient
      .from("invoice_line_items")
      .select("*")
      .eq("invoice_id", invoice.id);

    if (lineItems?.length && creditNote) {
      await adminClient.from("invoice_line_items").insert(
        lineItems.map((item: any) => ({
          invoice_id: creditNote.id,
          item_name: item.item_name,
          item_type: item.item_type,
          hsn_code: item.hsn_code,
          sac_code: item.sac_code,
          quantity: item.quantity,
          unit_price: item.unit_price,
          gst_rate: item.gst_rate,
          cgst_amount: item.cgst_amount,
          sgst_amount: item.sgst_amount,
          igst_amount: item.igst_amount,
          line_total: item.line_total,
          product_id: item.product_id,
          sort_order: item.sort_order,
        }))
      );
    }

    console.log(`Revenue reversed and credit note ${cnNumber} generated for booking ${bookingId}`);
  } catch (e) {
    console.error("reverseRevenueAndInvoice failed:", (e as Error).message);
  }
}

// ─── Loyalty points clawback on cancellation ───
// Reverses all loyalty points awarded for a specific booking.
async function clawbackLoyaltyPoints(adminClient: any, bookingId: string, bookingUserId: string, cancelledBy: string) {
  try {
    // Find all point allocations linked to this booking
    const { data: pointsTxns } = await adminClient
      .from("points_transactions")
      .select("id, points, description")
      .eq("booking_id", bookingId)
      .eq("type", "allocation");

    if (!pointsTxns || pointsTxns.length === 0) {
      console.log(`No loyalty points to claw back for booking ${bookingId}`);
      return 0;
    }

    const totalToDeduct = pointsTxns.reduce((sum: number, tx: any) => sum + (tx.points || 0), 0);
    if (totalToDeduct <= 0) return 0;

    // Deduct points from user profile (use RPC, fallback to direct update)
    const { error: rpcErr } = await adminClient.rpc("increment_user_points", {
      p_user_id: bookingUserId,
      p_delta: -totalToDeduct,
    });

    if (rpcErr) {
      // Fallback: direct update, floor at 0
      const { data: profile } = await adminClient.from("profiles").select("points").eq("user_id", bookingUserId).single();
      const newPoints = Math.max(0, (profile?.points || 0) - totalToDeduct);
      await adminClient.from("profiles").update({ points: newPoints }).eq("user_id", bookingUserId);
    }

    // Log clawback transaction
    await adminClient.from("points_transactions").insert({
      user_id: bookingUserId,
      type: "redemption",
      points: totalToDeduct,
      description: `Points reversed: booking cancelled`,
      booking_id: bookingId,
      created_by: cancelledBy,
      event_type: "cancellation_clawback",
      reason: `Clawback for cancelled booking ${bookingId}`,
    });

    // Notify user
    await adminClient.from("notifications").insert({
      user_id: bookingUserId,
      title: "🔄 Points Reversed",
      message: `${totalToDeduct} EDGE points were reversed due to a booking cancellation.`,
      type: "reward",
    });

    console.log(`Clawed back ${totalToDeduct} loyalty points for booking ${bookingId}`);
    return totalToDeduct;
  } catch (e) {
    console.error("Loyalty clawback failed (non-fatal):", e);
    return 0;
  }
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
    console.error("Failed to fetch calendar timezone:", (e as Error).message);
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
    // Body size limit: 256 KB is generous for any calendar-sync operation
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 256_000) {
      return new Response(JSON.stringify({ error: "Request body too large" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, ...params } = body;

    // Guest booking does not require authentication
    if (action === "guest_booking") {
      const {
        payment_id, order_id,
        start_time, end_time, duration_minutes, city, bay_id, bay_name,
        session_type, guest_name, guest_email, guest_phone, calendar_email,
        user_id_override,
      } = params;

      const adminClient = createAdminClient();

      // Check for overlapping bookings
      const overlapQuery = adminClient
        .from("bookings")
        .select("id")
        .in("status", ["confirmed", "pending"])
        .gte("end_time", start_time)
        .lte("start_time", end_time);
      if (bay_id) overlapQuery.eq("bay_id", bay_id);
      else overlapQuery.eq("city", city);

      const { data: existing } = await overlapQuery;
      if (existing && existing.length > 0) {
        return new Response(
          JSON.stringify({ error: "This slot is no longer available. Please refresh and try again." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Try to create Google Calendar event (skip if no service account configured)
      let calendarEventId: string | null = null;
      const serviceAccountKeyStr = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
      if (serviceAccountKeyStr && calendar_email) {
        try {
          const serviceAccountKey = JSON.parse(serviceAccountKeyStr);
          const accessToken = await getAccessToken(serviceAccountKey);
          const calTz = await getCalendarTimezone(accessToken, calendar_email);
          const summary = `${bay_name || city} - ${guest_name} (Guest)`;
          const desc = `Guest booking by ${guest_name}\nEmail: ${guest_email}\nPhone: ${guest_phone}`;
          const calEvent = await createEvent(accessToken, calendar_email, summary, start_time, end_time, calTz, desc);
          calendarEventId = calEvent.id;
        } catch (e) {
          console.error("Calendar event creation failed (non-fatal for guest):", e);
        }
      }

      // If user_id_override is provided (admin booking for existing member), use it directly
      let guestUserId = "00000000-0000-0000-0000-000000000000";
      if (user_id_override) {
        guestUserId = user_id_override;
      } else if (guest_email) {
        const { data: existingProfile } = await adminClient
          .from("profiles")
          .select("id, user_id")
          .eq("email", guest_email)
          .maybeSingle();

      if (existingProfile) {
          guestUserId = existingProfile.user_id || existingProfile.id;
          // Update phone and preferred_city if missing
          await adminClient
            .from("profiles")
            .update({
              phone: guest_phone || existingProfile.phone || null,
              preferred_city: existingProfile.preferred_city || city || null,
              display_name: existingProfile.display_name || guest_name,
            })
            .eq("id", existingProfile.id);
        } else {
          const { data: newProfile } = await adminClient
            .from("profiles")
            .insert({
              display_name: guest_name,
              email: guest_email,
              phone: guest_phone || null,
              user_type: "guest",
              preferred_city: city || null,
            })
            .select("id")
            .single();
          if (newProfile) guestUserId = newProfile.id;
        }
      }

      // Insert booking
      const { data: booking, error: bookingError } = await adminClient
        .from("bookings")
        .insert({
          user_id: guestUserId,
          city,
          start_time,
          end_time,
          duration_minutes,
          status: "confirmed",
          session_type: session_type || "practice",
          bay_id: bay_id || null,
          calendar_event_id: calendarEventId,
          note: `Guest: ${guest_name} | ${guest_email} | ${guest_phone}`,
        })
        .select()
        .single();

      if (bookingError) throw bookingError;

      // Create revenue transaction for guest booking
      try {
        await adminClient.from("revenue_transactions").insert({
          transaction_type: "guest_booking",
          amount: params.amount || 0,
          currency: params.currency || "INR",
          guest_name,
          guest_email,
          guest_phone,
          gateway_name: params.gateway_name || "razorpay",
          gateway_order_ref: order_id || null,
          gateway_payment_ref: payment_id || null,
          booking_id: booking.id,
          description: `Guest booking - ${bay_name || city} - ${guest_name}`,
          status: "confirmed",
          city: city || null,
        });
      } catch (e) {
        console.error("Failed to create revenue transaction for guest:", (e as Error).message);
      }

      // Get timezone once for notifications (reuse cached access token if available)
      let calTzNotify = "UTC";
      try {
        if (calendar_email && serviceAccountKeyStr) {
          const sak = JSON.parse(serviceAccountKeyStr);
          const notifyToken = await getAccessToken(sak);
          calTzNotify = await getCalendarTimezone(notifyToken, calendar_email);
        }
      } catch (e) {
        console.error("Failed to get calendar timezone for notifications:", (e as Error).message);
      }

      // Notify admins + site-admins about the guest booking
      try {
        const notifyAdminIds = await getAdminAndSiteAdminIds(adminClient, city);
        await notifyAdminsInApp(adminClient, notifyAdminIds, "📅 New Guest Booking", `Guest ${guest_name} booked ${bay_name || city} on ${formatDateTime(start_time, calTzNotify)}.`);
        await notifyAdmins(adminClient, notifyAdminIds, "admin_new_booking", "📅 New Guest Booking", {
          member_name: guest_name,
          city,
          bay: bay_name || city,
          date: formatDate(start_time, calTzNotify),
          time: formatTimeRange(start_time, end_time, calTzNotify),
          duration: `${duration_minutes} min`,
          session_type: "practice",
          is_guest: true,
        });
      } catch (e) {
        console.error("Failed to notify admins about guest booking:", (e as Error).message);
      }

      // Send confirmation email to the guest
      if (guest_email) {
        try {
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              template: "guest_booking_confirmed",
              subject: "✅ Your Booking is Confirmed!",
              recipient_email: guest_email,
              data: {
                display_name: guest_name,
                city,
                bay: bay_name || city,
                date: formatDate(start_time, calTzNotify),
                time: formatTimeRange(start_time, end_time, calTzNotify),
                duration: `${duration_minutes} min`,
                amount: params.amount || null,
              },
            }),
          });
        } catch (e) {
          console.error("Failed to send guest confirmation email:", (e as Error).message);
        }
      }

      return new Response(JSON.stringify({ booking }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // All other actions require authentication
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

    // list_slots is a read-only action that does NOT require authentication
    // so that public/guest users can see real-time availability
    if (action === "list_slots") {
      const { calendar_email, date, open_time, close_time } = params;
      const accessToken = await getAccessToken(serviceAccountKey);

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

      // Calculate earliest bookable slot: next :00 or :30 strictly after now (in UTC)
      // We work entirely in UTC millis — dayStart/dayEnd are already correct UTC timestamps
      const now = Date.now();
      // Round "now" up to the next :00 or :30 boundary (in real UTC time)
      const nowDate = new Date(now);
      const utcMins = nowDate.getUTCMinutes();
      let earliest: number;
      if (utcMins < 30) {
        earliest = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate(), nowDate.getUTCHours(), 30, 0, 0);
      } else {
        earliest = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate(), nowDate.getUTCHours() + 1, 0, 0, 0);
      }

      for (let t = dayStart; t < dayEnd; t += 30 * 60 * 1000) {
        const slotEnd = t + 30 * 60 * 1000;
        const isBusy = busy.some((b) => t < b.end && slotEnd > b.start);
        const isPast = t < earliest;
        slots.push({
          time: new Date(t).toISOString(),
          available: !isBusy && !isPast,
        });
      }

      return new Response(JSON.stringify({ slots }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // All other actions require authentication
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

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = authUser.id;

    const accessToken = await getAccessToken(serviceAccountKey);

    // list_slots is handled above (before auth check) — this block is intentionally removed

    if (action === "create_booking") {
      const { calendar_email, start_time, end_time, duration_minutes, city, bay_id, bay_name, display_name, session_type, payment_method, user_id_override } = params;

      // If an admin/site_admin is booking on behalf of a member, use their user_id
      let bookingUserId = userId;
      if (user_id_override && user_id_override !== userId) {
        const adminClient = createAdminClient();
        const { data: callerIsAdminOrSA } = await adminClient.rpc("is_admin_or_site_admin", { _user_id: userId });
        if (callerIsAdminOrSA) {
          bookingUserId = user_id_override;
        }
      }

      // If payment was made via a gateway (e.g. Razorpay), skip hours check/deduction
      const paidViaGateway = !!payment_method && payment_method !== "hours";

      // Get the calendar's timezone for consistent formatting
      const calTz = await getCalendarTimezone(accessToken, calendar_email);

      // Get bay config for coaching mode
      let coachingMode = "instant";
      let coachingHours = 1;
      // Use adminClient for hours check and booking insert to avoid RLS issues with user_id_override
      const adminClient = createAdminClient();

      if (bay_id) {
        const { data: bayData } = await adminClient.from("bays").select("coaching_mode, coaching_hours").eq("id", bay_id).single();
        if (bayData) {
          coachingMode = bayData.coaching_mode || "instant";
          coachingHours = bayData.coaching_hours || 1;
        }
      }

      const isCoaching = session_type === "coaching";
      const needsApproval = isCoaching && coachingMode === "approval_required";
      const hoursNeeded = isCoaching ? coachingHours : duration_minutes / 60;

      // Only check/deduct balance for non-pending, non-gateway-paid bookings
      if (!needsApproval && !paidViaGateway) {
        const { data: hours } = await adminClient
          .from("member_hours")
          .select("*")
          .eq("user_id", bookingUserId)
          .maybeSingle();

        const remaining = (hours?.hours_purchased ?? 0) - (hours?.hours_used ?? 0);
        if (remaining < hoursNeeded) {
          return new Response(
            JSON.stringify({ error: `Insufficient hours. You have ${remaining}h, need ${hoursNeeded}h.` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Check no overlap with existing bookings for this specific bay (both confirmed and pending block slots)
      const overlapQuery = adminClient
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
        user_id: bookingUserId,
        city,
        start_time,
        end_time,
        duration_minutes,
        status: bookingStatus,
        calendar_event_id: calEvent.id,
        session_type: session_type || "practice",
      };
      if (bay_id) bookingInsert.bay_id = bay_id;

      const { data: booking, error: bookingError } = await adminClient.from("bookings").insert(bookingInsert).select().single();
      if (bookingError) throw bookingError;

      // Deduct hours only for instant bookings that were NOT paid via gateway
      if (!needsApproval && !paidViaGateway) {

        const { data: hours } = await adminClient
          .from("member_hours")
          .select("*")
          .eq("user_id", bookingUserId)
          .single();

        await adminClient
          .from("member_hours")
          .update({ hours_used: (hours?.hours_used ?? 0) + hoursNeeded })
          .eq("user_id", bookingUserId);

        const { data: htxn } = await adminClient.from("hours_transactions").insert({
          user_id: bookingUserId,
          type: "deduction",
          hours: hoursNeeded,
          note: `${isCoaching ? "Coaching" : "Bay"} booking - ${bayLabel} - ${formatShortDate(start_time, calTz)}`,
          created_by: userId,
        }).select("id").single();

        // Create revenue transaction for hours deduction
        try {
          await adminClient.from("revenue_transactions").insert({
            transaction_type: "hours_deduction",
            amount: 0,
            currency: "INR",
            user_id: bookingUserId,
            booking_id: booking.id,
            hours_transaction_id: htxn?.id || null,
            description: `${isCoaching ? "Coaching" : "Bay"} booking (${hoursNeeded}h) - ${bayLabel}`,
            status: "confirmed",
          });
        } catch (e) {
          console.error("Failed to create revenue transaction for hours deduction:", (e as Error).message);
        }

        const remaining = (hours?.hours_purchased ?? 0) - (hours?.hours_used ?? 0) - hoursNeeded;

        await adminClient.from("notifications").insert({
          user_id: bookingUserId,
          title: isCoaching ? "Coaching Booked!" : "Bay Booked!",
          message: `Your ${bayLabel} ${isCoaching ? "coaching session" : "bay"} has been booked for ${formatDateTime(start_time, calTz)} (${hoursNeeded}h). ${remaining}h remaining.`,
          type: "booking",
        });

        // Check low hours threshold from admin config
        let lowHoursThreshold = 2;
        try {
          const { data: thresholdConfig } = await adminClient.from("admin_config").select("value").eq("key", "low_hours_threshold").single();
          if (thresholdConfig?.value) lowHoursThreshold = parseFloat(thresholdConfig.value);
        } catch (_) {}

        if (remaining <= lowHoursThreshold && remaining >= 0) {
          await adminClient.from("notifications").insert({
            user_id: bookingUserId,
            title: "⚠️ Low Hours Balance",
            message: `You have only ${remaining}h remaining. Consider purchasing more hours.`,
            type: "warning",
          });
          // Send low hours alert email
          try {
            await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification-email`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({
                user_id: bookingUserId,
                template: "low_hours_alert",
                subject: "Low Hours Alert",
                data: {
                  hours_remaining: remaining,
                  purchase_url: "https://golfersedge.golf-collective.com/dashboard",
                },
              }),
            });
          } catch (e) {
            console.error("Failed to send low hours alert email:", (e as Error).message);
          }
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
              user_id: bookingUserId,
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
          console.error("Failed to send booking confirmation email:", (e as Error).message);
        }

        // Notify admins + site-admins about new confirmed booking
        try {
          const { data: userPrf } = await adminClient.from("profiles").select("display_name").eq("user_id", bookingUserId).single();
          const memberName = userPrf?.display_name || display_name || "A member";
          const notifyIds = await getAdminAndSiteAdminIds(adminClient, city, bookingUserId);
          await notifyAdminsInApp(adminClient, notifyIds, "📅 New Booking", `${memberName} booked ${bayLabel}${isCoaching ? " (Coaching)" : ""} on ${formatDateTime(start_time, calTz)}.`);
          await notifyAdmins(adminClient, notifyIds, "admin_new_booking", "📅 New Booking", {
            member_name: memberName,
            city,
            bay: bayLabel,
            date: formatDate(start_time, calTz),
            time: formatTimeRange(start_time, end_time, calTz),
            duration: `${hoursNeeded}h`,
            session_type: isCoaching ? "coaching" : "practice",
          });
        } catch (e) {
          console.error("Failed to notify admins about new booking:", (e as Error).message);
        }
      } else if (paidViaGateway && !needsApproval) {
        // Gateway-paid booking — no hours deduction, just notifications

        await adminClient.from("notifications").insert({
          user_id: bookingUserId,
          title: isCoaching ? "Coaching Booked!" : "Bay Booked!",
          message: `Your ${bayLabel} ${isCoaching ? "coaching session" : "bay"} has been booked for ${formatDateTime(start_time, calTz)} (${hoursNeeded}h). Payment confirmed via ${payment_method}.`,
          type: "booking",
        });

        // Send confirmed booking email
        try {
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              user_id: bookingUserId,
              template: "booking_confirmed",
              subject: "✅ Bay Booking Confirmed!",
              data: {
                city,
                bay: bayLabel,
                date: formatDate(start_time, calTz),
                time: formatTimeRange(start_time, end_time, calTz),
                duration: `${hoursNeeded}h`,
                hours_remaining: "N/A (paid via gateway)",
              },
            }),
          });
        } catch (e) {
          console.error("Failed to send booking confirmation email:", (e as Error).message);
        }

        // Notify admins + site-admins about new confirmed booking
        try {
          const { data: userPrf } = await adminClient.from("profiles").select("display_name").eq("user_id", bookingUserId).single();
          const memberName = userPrf?.display_name || display_name || "A member";
          const notifyIds = await getAdminAndSiteAdminIds(adminClient, city, bookingUserId);
          await notifyAdminsInApp(adminClient, notifyIds, "📅 New Booking (Paid)", `${memberName} booked ${bayLabel}${isCoaching ? " (Coaching)" : ""} on ${formatDateTime(start_time, calTz)} — paid via ${payment_method}.`);
          await notifyAdmins(adminClient, notifyIds, "admin_new_booking", "📅 New Booking (Paid)", {
            member_name: memberName,
            city,
            bay: bayLabel,
            date: formatDate(start_time, calTz),
            time: formatTimeRange(start_time, end_time, calTz),
            duration: `${hoursNeeded}h`,
            session_type: isCoaching ? "coaching" : "practice",
          });
        } catch (e) {
          console.error("Failed to notify admins about new booking:", (e as Error).message);
        }
      } else {
        // Pending coaching notification
        await supabase.from("notifications").insert({
          user_id: bookingUserId,
          title: "🕐 Coaching Pending Approval",
          message: `Your coaching session at ${bayLabel} on ${formatDateTime(start_time, calTz)} is awaiting admin approval.`,
          type: "booking",
        });

        // Notify admins + site-admins
        const notifyIds = await getAdminAndSiteAdminIds(adminClient, city);
        await notifyAdminsInApp(adminClient, notifyIds, "📋 New Coaching Request", `${display_name || "A member"} has requested a coaching session at ${bayLabel} on ${formatDateTime(start_time, calTz)}. Please approve or reject.`, `/admin?tab=bookinglogs&status=pending&type=coaching`);

        // Send pending coaching email to user
        try {
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              user_id: bookingUserId,
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
          console.error("Failed to send pending coaching email:", (e as Error).message);
        }

        // Send coaching request email to admins + site-admins
        await notifyAdmins(adminClient, notifyIds, "admin_coaching_request", "🕐 Coaching Request — Action Required", {
          member_name: display_name || "A member",
          city,
          bay: bayLabel,
          date: formatDate(start_time, calTz),
          time: formatTimeRange(start_time, end_time, calTz),
          duration: `${duration_minutes / 60}h`,
        });
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
      let coachingCancellationRefundHours = 0;
      let calendarEmail: string | null = null;
      let bayName = booking.city;
      if (booking.bay_id) {
        const { data: bay } = await adminClient.from("bays").select("coaching_hours, coaching_cancellation_refund_hours, calendar_email, name").eq("id", booking.bay_id).single();
        if (bay) {
          coachingHours = bay.coaching_hours || 1;
          coachingCancellationRefundHours = bay.coaching_cancellation_refund_hours ?? 0;
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

      const { data: htxn } = await adminClient.from("hours_transactions").insert({
        user_id: booking.user_id,
        type: "deduction",
        hours: hoursNeeded,
        note: `Coaching approved - ${bayName} - ${formatShortDate(booking.start_time, calTz)}`,
        created_by: userId,
      }).select("id").single();

      // Revenue transaction for coaching approval
      try {
        await adminClient.from("revenue_transactions").insert({
          transaction_type: "hours_deduction",
          amount: 0,
          currency: "INR",
          user_id: booking.user_id,
          booking_id: booking_id,
          hours_transaction_id: htxn?.id || null,
          description: `Coaching approved (${hoursNeeded}h) - ${bayName}`,
          status: "confirmed",
        });
      } catch (e) {
        console.error("Failed to create revenue transaction for coaching approval:", (e as Error).message);
      }

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
          console.error("Failed to update calendar event:", (e as Error).message);
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
              cancellation_penalty: (() => {
                const penalty = hoursNeeded - coachingCancellationRefundHours;
                return penalty > 0 ? `${penalty}h` : null;
              })(),
              cancellation_refund: `${coachingCancellationRefundHours}h`,
            },
          }),
        });
      } catch (e) {
        console.error("Failed to send approval email:", (e as Error).message);
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
          console.error("Failed to delete calendar event:", (e as Error).message);
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
        console.error("Failed to send rejection email:", (e as Error).message);
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

      // Get calendar email, bay name, and coaching hours
      const adminClient = createAdminClient();

      // Check configurable cancellation policy (applies to confirmed bookings)
      if (booking.status === "confirmed") {
        // Fetch cancellation window from admin_config (default 24h)
        let cancellationWindowHours = 24;
        const { data: configRow } = await adminClient
          .from("admin_config")
          .select("value")
          .eq("key", "cancellation_window_hours")
          .single();
        if (configRow?.value) {
          const parsed = parseFloat(configRow.value);
          if (!isNaN(parsed) && parsed >= 0) cancellationWindowHours = parsed;
        }

        const hoursUntil = (new Date(booking.start_time).getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursUntil < cancellationWindowHours) {
          return new Response(
            JSON.stringify({ error: `Cancellations must be made at least ${cancellationWindowHours} hours in advance.` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      let calendarEmail: string | null = null;
      let bayName = booking.city;
      let coachingHours = 1;
      let coachingCancellationRefundHours: number | null = null;
      if (booking.bay_id) {
        const { data: bay } = await supabase.from("bays").select("calendar_email, name, coaching_hours, coaching_cancellation_refund_hours").eq("id", booking.bay_id).single();
        if (bay) {
          calendarEmail = bay.calendar_email || null;
          bayName = bay.name || booking.city;
          coachingHours = bay.coaching_hours || 1;
          coachingCancellationRefundHours = bay.coaching_cancellation_refund_hours ?? null;
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
          console.error("Failed to delete calendar event:", (e as Error).message);
        }
      }

      // Atomically mark booking cancelled + claw back loyalty points in one DB transaction
      const { data: cancelResult, error: cancelErr } = await adminClient
        .rpc("cancel_booking_with_clawback", { p_booking_id: booking_id, p_cancelled_by: userId });
      if (cancelErr) throw cancelErr;
      if ((cancelResult as any)?.already_cancelled) {
        return new Response(JSON.stringify({ error: "Booking already cancelled" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Refund hours only if was confirmed (pending bookings never had hours deducted)
      let hoursRefunded = 0;
      if (booking.status === "confirmed") {
        const isCoaching = booking.session_type === "coaching";
        // For coaching: use configurable cancellation refund hours (capped at coaching_hours); for practice: refund actual duration
        const hoursToRefund = isCoaching
          ? Math.min(coachingCancellationRefundHours ?? coachingHours, coachingHours)
          : booking.duration_minutes / 60;
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

        const { data: refundTxn, error: txError } = await adminClient.from("hours_transactions").insert({
          user_id: userId,
          type: "refund",
          hours: hoursToRefund,
          note: `Cancellation refund - ${bayName} - ${formatShortDate(booking.start_time, calTz)}`,
          created_by: userId,
        }).select("id").single();
        if (txError) console.error("Failed to insert refund transaction:", txError);

        // Revenue refund transaction
        try {
          await adminClient.from("revenue_transactions").insert({
            transaction_type: "refund",
            amount: 0,
            currency: "INR",
            user_id: userId,
            booking_id: booking.id,
            hours_transaction_id: refundTxn?.id || null,
            description: `Cancellation refund (${hoursToRefund}h) - ${bayName}`,
            status: "confirmed",
          });
        } catch (e) {
          console.error("Failed to create revenue refund transaction:", (e as Error).message);
        }
      }

      // Reverse paid revenue and auto-generate credit note for guest/walk-in bookings
      await reverseRevenueAndInvoice(adminClient, booking_id);

      // Loyalty clawback is handled atomically in cancel_booking_with_clawback RPC above
      const pointsClawedBack = (cancelResult as any)?.points_clawed_back ?? 0;

      // User notification
      await adminClient.from("notifications").insert({
        user_id: userId,
        title: "Booking Cancelled",
        message: `Your ${booking.session_type === "coaching" ? "coaching" : "bay"} booking at ${bayName} on ${formatDateTime(booking.start_time, calTz)} has been cancelled.${hoursRefunded > 0 ? ` ${hoursRefunded}h refunded.` : ""}`,
        type: "booking",
      });

      // Admin + site-admin notifications (in-app + email)
      const { data: userProfile } = await adminClient.from("profiles").select("display_name").eq("user_id", userId).single();
      const displayName = userProfile?.display_name || "A member";
      const notifyIds = await getAdminAndSiteAdminIds(adminClient, booking.city, userId);
      await notifyAdminsInApp(adminClient, notifyIds, "🚫 Booking Cancelled", `${displayName} cancelled their ${booking.session_type === "coaching" ? "coaching" : "bay"} booking at ${bayName} on ${formatDateTime(booking.start_time, calTz)}.${hoursRefunded > 0 ? ` ${hoursRefunded}h refunded.` : ""}`);
      await notifyAdmins(adminClient, notifyIds, "admin_booking_cancelled", "🚫 Booking Cancelled by Member", {
        member_name: displayName,
        city: booking.city,
        bay: bayName,
        date: formatDate(booking.start_time, calTz),
        time: formatTime(booking.start_time, calTz),
        session_type: booking.session_type,
        hours_refunded: hoursRefunded,
        cancelled_by: "member",
      });

      // Send cancellation email to user
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
              date: formatDate(booking.start_time, calTz),
              time: formatTime(booking.start_time, calTz),
              duration: `${booking.duration_minutes} min`,
              hours_refunded: hoursRefunded,
            },
          }),
        });
      } catch (e) {
        console.error("Failed to send cancellation email:", (e as Error).message);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin cancel booking — bypasses user ownership check and cancellation window
    if (action === "admin_cancel_booking") {
      const { booking_id } = params;
      const adminClient = createAdminClient();

      // Verify caller is admin or site_admin
      const { data: isAdminOrSiteAdmin } = await supabase.rpc("is_admin_or_site_admin", { _user_id: userId });
      if (!isAdminOrSiteAdmin) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: booking } = await adminClient
        .from("bookings")
        .select("*")
        .eq("id", booking_id)
        .single();

      if (!booking) {
        return new Response(JSON.stringify({ error: "Booking not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // For site_admins, verify city access
      const { data: hasCityAccess } = await supabase.rpc("has_city_access", { _user_id: userId, _city: booking.city });
      if (!hasCityAccess) {
        return new Response(JSON.stringify({ error: "You do not have access to this city" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let calendarEmail: string | null = null;
      let bayName = booking.city;
      let coachingHours = 1;
      let coachingCancellationRefundHours: number | null = null;
      if (booking.bay_id) {
        const { data: bay } = await adminClient.from("bays").select("calendar_email, name, coaching_hours, coaching_cancellation_refund_hours").eq("id", booking.bay_id).single();
        if (bay) {
          calendarEmail = bay.calendar_email || null;
          bayName = bay.name || booking.city;
          coachingHours = bay.coaching_hours || 1;
          coachingCancellationRefundHours = bay.coaching_cancellation_refund_hours ?? null;
        }
      }
      if (!calendarEmail) {
        const { data: bayConfig } = await adminClient.from("bay_config").select("calendar_email").eq("city", booking.city).single();
        calendarEmail = bayConfig?.calendar_email || null;
      }

      const calTz = calendarEmail ? await getCalendarTimezone(accessToken, calendarEmail) : "UTC";

      // Delete calendar event
      if (booking.calendar_event_id && calendarEmail) {
        try { await deleteEvent(accessToken, calendarEmail, booking.calendar_event_id); } catch (e) { console.error("Failed to delete calendar event:", (e as Error).message); }
      }

      // Update booking status
      await adminClient.from("bookings").update({ status: "cancelled", note: booking.note ? `${booking.note} | Admin cancelled` : "Admin cancelled" }).eq("id", booking_id);

      // Refund hours if was confirmed
      let hoursRefunded = 0;
      if (booking.status === "confirmed") {
        const isCoaching = booking.session_type === "coaching";
        const hoursToRefund = isCoaching
          ? Math.min(coachingCancellationRefundHours ?? coachingHours, coachingHours)
          : booking.duration_minutes / 60;
        hoursRefunded = hoursToRefund;

        const { data: memberHours } = await adminClient.from("member_hours").select("*").eq("user_id", booking.user_id).single();
        if (memberHours) {
          await adminClient.from("member_hours").update({ hours_used: Math.max(0, memberHours.hours_used - hoursToRefund) }).eq("user_id", booking.user_id);
        }

        const { data: refundTxn } = await adminClient.from("hours_transactions").insert({
          user_id: booking.user_id,
          type: "refund",
          hours: hoursToRefund,
          note: `Admin cancellation refund - ${bayName} - ${formatShortDate(booking.start_time, calTz)}`,
          created_by: userId,
        }).select("id").single();

        // Revenue refund transaction
        try {
          await adminClient.from("revenue_transactions").insert({
            transaction_type: "refund",
            amount: 0,
            currency: "INR",
            user_id: booking.user_id,
            booking_id: booking_id,
            hours_transaction_id: refundTxn?.id || null,
            description: `Admin cancellation refund (${hoursToRefund}h) - ${bayName}`,
            status: "confirmed",
          });
        } catch (e) {
          console.error("Failed to create revenue refund transaction:", (e as Error).message);
        }
      }

      // Reverse paid revenue and auto-generate credit note for guest/walk-in bookings
      await reverseRevenueAndInvoice(adminClient, booking_id);

      // Claw back loyalty points awarded for this booking
      const pointsClawedBack = await clawbackLoyaltyPoints(adminClient, booking_id, booking.user_id, userId);

      // Notify booking owner
      await adminClient.from("notifications").insert({
        user_id: booking.user_id,
        title: "Booking Cancelled by Admin",
        message: `Your ${booking.session_type === "coaching" ? "coaching" : "bay"} booking at ${bayName} on ${formatDateTime(booking.start_time, calTz)} has been cancelled by admin.${hoursRefunded > 0 ? ` ${hoursRefunded}h refunded.` : ""}`,
        type: "booking",
      });

      // Send cancellation email to user
      try {
        await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-notification-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
          body: JSON.stringify({
            user_id: booking.user_id,
            template: "booking_cancelled",
            subject: "🚫 Booking Cancelled by Admin",
            data: { bay: bayName, city: booking.city, date: formatDate(booking.start_time, calTz), time: formatTime(booking.start_time, calTz), duration: `${booking.duration_minutes} min`, hours_refunded: hoursRefunded },
          }),
        });
      } catch (e) { console.error("Failed to send cancellation email:", (e as Error).message);

      // Notify other admins + site-admins about the admin cancellation
      try {
        const { data: ownerProfile } = await adminClient.from("profiles").select("display_name").eq("user_id", booking.user_id).single();
        const memberName = ownerProfile?.display_name || "A member";
        const adminNotifyIds = await getAdminAndSiteAdminIds(adminClient, booking.city);
        await notifyAdminsInApp(adminClient, adminNotifyIds, "🚫 Booking Cancelled by Admin", `Admin cancelled ${memberName}'s ${booking.session_type === "coaching" ? "coaching" : "bay"} booking at ${bayName} on ${formatDateTime(booking.start_time, calTz)}.`);
        await notifyAdmins(adminClient, adminNotifyIds, "admin_booking_cancelled", "🚫 Booking Cancelled by Admin", {
          member_name: memberName,
          city: booking.city,
          bay: bayName,
          date: formatDate(booking.start_time, calTz),
          time: formatTime(booking.start_time, calTz),
          session_type: booking.session_type,
          hours_refunded: hoursRefunded,
          cancelled_by: "admin",
        });
      } catch (e) { console.error("Failed to notify admins about admin cancellation:", (e as Error).message);

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
