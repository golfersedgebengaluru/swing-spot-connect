import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3";
import {
  bookingCharge,
  bookingDurationMinutes,
  couponDiscount,
  dayTypeForDate,
  isLocalDateOfStart,
} from "../_shared/checkout-pricing.ts";
import { cityBookingMode, loadBay, PAYMENT_HOLD_MINUTES, releaseHold, reserveBay } from "../_shared/app-availability.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_BODY_BYTES = 10_000;

const Coupon = z.object({
  coupon_code: z.string().trim().min(1).max(64).optional(),
  coupon_session_id: z.string().max(100).optional(),
});

// Callers describe WHAT they are buying; the price, payment account and the
// pending checkout record are all derived here from server-side records.
const BookingOrder = Coupon.extend({
  purpose: z.literal("booking"),
  bay_id: z.string().uuid(),
  start_time: z.string().datetime({ offset: true }),
  duration_minutes: z.number().int().positive().max(24 * 60),
  session_type: z.string().min(1).max(50),
  local_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guest: z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(255),
    phone: z.string().trim().min(5).max(30),
  }).optional(),
});

const HourPackageOrder = Coupon.extend({
  purpose: z.literal("hour_package"),
  package_id: z.string().uuid(),
});

const OrderSchema = z.discriminatedUnion("purpose", [BookingOrder, HourPackageOrder]);

// Errors are returned with 200 so the browser can show the message (project convention).
const json = (payload: unknown, _status = 200) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (Number(req.headers.get("content-length") || 0) > MAX_BODY_BYTES) {
      return json({ error: "Request body too large" }, 413);
    }

    const parsed = OrderSchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: "Invalid request", details: parsed.error.issues }, 400);
    const order = parsed.data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Guests may create booking orders; everything else requires a signed-in member.
    const authHeader = req.headers.get("Authorization");
    let user: { id: string; email?: string; user_metadata?: Record<string, unknown>; is_anonymous?: boolean } | null = null;
    if (authHeader?.startsWith("Bearer ")) {
      const authClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data } = await authClient.auth.getUser();
      user = data.user && !data.user.is_anonymous ? data.user : null;
    }

    const applyCoupon = async (total: number) => {
      if (!order.coupon_code) return 0;
      const { data, error } = await admin.rpc("validate_coupon", {
        p_code: order.coupon_code,
        p_user_id: user?.id ?? null,
        p_session_id: user ? null : order.coupon_session_id ?? null,
      });
      if (error) throw new Error("Coupon check failed");
      if (!data?.valid) throw new CheckoutError(data?.error || "Invalid coupon code");
      return couponDiscount(data, total);
    };

    let city: string;
    let currency: string;
    let amount: number;
    let notes: Record<string, string>;
    let stashPending: (orderId: string) => Promise<{ error: { message: string } | null }>;
    let paymentHoldId: string | null = null;
    // Any failure before the pending record exists must free the held slot.
    const failWithHoldReleased = async (payload: unknown, status: number) => {
      await releaseHold(admin, paymentHoldId);
      return json(payload, status);
    };

    if (order.purpose === "booking") {
      if (!user && !order.guest) return json({ error: "Guest contact details are required" }, 400);
      let bay = await loadBay(admin, order.bay_id);
      if (!bay || !bay.is_active) return json({ error: "This bay is not available" }, 400);
      if (!isLocalDateOfStart(order.local_date, order.start_time)) return json({ error: "Booking date does not match the selected time" }, 400);
      const dayType = dayTypeForDate(order.local_date);
      const { data: price } = await admin
        .from("bay_pricing")
        .select("price_per_hour, currency")
        .eq("city", bay.city).eq("bay_type", bay.bay_type).eq("day_type", dayType).eq("session_type", order.session_type)
        .order("id").limit(1).maybeSingle();
      if (!price) return json({ error: "Price not available for this selection." }, 400);

      const startMs = Date.parse(order.start_time);
      const endTime = new Date(startMs + order.duration_minutes * 60_000).toISOString();
      const startTime = new Date(startMs).toISOString();
      if (bookingDurationMinutes(startTime, endTime) !== order.duration_minutes) return json({ error: "Invalid booking duration" }, 400);

      const total = Number(price.price_per_hour) * (order.duration_minutes / 60);
      const charge = bookingCharge(Number(price.price_per_hour), order.duration_minutes, await applyCoupon(total));
      if (charge.amount <= 0) return json({ error: "Price not available for this selection." }, 400);

      // App-calendar cities hold a free bay of this type for the payment window.
      if ((await cityBookingMode(admin, bay.city)).source === "app") {
        const reservation = await reserveBay(admin, {
          bay, exact: false, start: startTime, end: endTime, holdMinutes: PAYMENT_HOLD_MINUTES,
        });
        if (!reservation) return json({ error: "This time is no longer available. Please pick another slot." }, 409);
        paymentHoldId = reservation.hold_id;
        if (reservation.bay_id !== bay.id) bay = (await loadBay(admin, reservation.bay_id)) ?? bay;
      }
      const heldBay = bay;

      city = heldBay.city;
      currency = price.currency || "INR";
      amount = charge.amount;
      notes = { bay: heldBay.name, city, date: order.local_date, duration: `${order.duration_minutes / 60}h`, session_type: order.session_type };
      const common = {
        city, bay_id: heldBay.id, bay_name: heldBay.name, start_time: startTime, end_time: endTime,
        duration_minutes: order.duration_minutes, session_type: order.session_type,
        amount: charge.amount, currency, coupon_code: order.coupon_code ?? null,
        discount_amount: charge.discount, original_amount: charge.total,
      };
      stashPending = user
        ? (orderId) => admin.from("pending_bookings").insert({
            ...common, razorpay_order_id: orderId, user_id: user!.id,
            display_name: (user!.user_metadata?.display_name as string | undefined) || user!.email || null,
          })
        : (orderId) => admin.from("pending_guest_bookings").insert({
            ...common, razorpay_order_id: orderId,
            guest_name: order.guest!.name, guest_email: order.guest!.email, guest_phone: order.guest!.phone,
          });
    } else {
      if (!user) return json({ error: "Please sign in to buy hours" }, 401);
      const [{ data: pkg }, { data: profile }] = await Promise.all([
        admin.from("hour_packages").select("id, hours, price, currency, label, is_active").eq("id", order.package_id).maybeSingle(),
        admin.from("profiles").select("preferred_city").eq("user_id", user.id).maybeSingle(),
      ]);
      if (!pkg || !pkg.is_active) return json({ error: "This package is not available" }, 400);
      if (!profile?.preferred_city) return json({ error: "Please set your preferred city in your profile before purchasing." }, 400);
      const price = Number(pkg.price);
      const discount = await applyCoupon(price);
      amount = Math.max(0, price - discount);
      if (amount <= 0) return json({ error: "Price not available for this package." }, 400);
      city = profile.preferred_city;
      currency = pkg.currency || "INR";
      notes = { type: "hour_package", hours: String(pkg.hours), label: pkg.label || "", user_id: user.id };
      stashPending = (orderId) => admin.from("pending_purchases").insert({
        user_id: user!.id, razorpay_order_id: orderId, package_hours: pkg.hours, package_price: pkg.price,
        package_label: pkg.label || `${pkg.hours}h Package`, currency, city, status: "pending",
      });
    }

    const { data: gateway } = await admin
      .from("payment_gateways")
      .select("api_key, api_secret, city, is_active")
      .eq("city", city)
      .eq("is_active", true)
      .maybeSingle();
    if (!gateway) return failWithHoldReleased({ error: "No active Razorpay gateway found for this city" }, 400);

    const apiKey = (gateway.api_key || "").trim();
    const citySlug = city.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const apiSecret = (Deno.env.get(`RAZORPAY_SECRET_${citySlug}`) || gateway.api_secret || "").trim();
    if (!apiKey || !apiSecret) return failWithHoldReleased({ error: "Razorpay API credentials not configured for this city" }, 400);

    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${btoa(`${apiKey}:${apiSecret}`)}` },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        currency,
        receipt: `${order.purpose === "booking" ? "booking" : "hours"}_${Date.now()}`,
        notes,
      }),
    });
    if (!rzpRes.ok) {
      await rzpRes.text();
      console.error("Razorpay order creation failed — HTTP", rzpRes.status);
      return failWithHoldReleased({ error: "Failed to create Razorpay order" }, 500);
    }
    const rzpOrder = await rzpRes.json();

    // The pending record is what the webhook finalizes; without it no payment may be taken.
    const { error: stashErr } = await stashPending(rzpOrder.id);
    if (stashErr) {
      console.error("create-razorpay-order pending record failed:", stashErr.message);
      return failWithHoldReleased({ error: "Could not start payment. Please try again." }, 500);
    }
    if (paymentHoldId) {
      await admin.from("bay_holds").update({ razorpay_order_id: rzpOrder.id }).eq("id", paymentHoldId);
    }

    return json({
      order_id: rzpOrder.id, amount: rzpOrder.amount, currency: rzpOrder.currency, key_id: apiKey, charge_amount: amount,
      ...(paymentHoldId ? { hold_minutes: PAYMENT_HOLD_MINUTES } : {}),
    });
  } catch (err) {
    if (err instanceof CheckoutError) return json({ error: err.message }, 400);
    console.error("create-razorpay-order error:", (err as Error).message);
    return json({ error: "Internal server error" }, 500);
  }
});

class CheckoutError extends Error {}
