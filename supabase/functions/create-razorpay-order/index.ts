import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_BODY_BYTES = 10_000;

const OrderSchema = z.object({
  amount: z.number().positive("amount must be a positive number"),
  currency: z.string().length(3).optional().default("INR"),
  city: z.string().min(1).max(100),
  booking_summary: z.record(z.unknown()).optional(),
  receipt: z.string().max(40).optional(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // This endpoint is public — guests (unauthenticated) must be able to create
  // Razorpay orders. The actual booking security is enforced in calendar-sync.

  try {
    // Enforce body size limit
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: "Request body too large" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.json();
    const parsed = OrderSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request", details: parsed.error.issues }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { amount, currency, city, booking_summary, receipt } = parsed.data;

    // Get Razorpay credentials for this city from payment_gateways table
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: gateway, error: gwError } = await supabase
      .from("payment_gateways")
      .select("api_key, api_secret, city, is_test_mode, is_active")
      .eq("city", city)
      .eq("name", "razorpay")
      .eq("is_active", true)
      .single();

    if (gwError || !gateway) {
      return new Response(
        JSON.stringify({ error: "No active Razorpay gateway found for this city" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const gw: any = gateway;
    const apiKey = (gw.api_key || "").trim();

    // Prefer env var secret (RAZORPAY_SECRET_<CITY_SLUG>) over DB column.
    // The DB column will be dropped once all cities have env vars configured.
    const citySlug = (gw.city_slug || city.toLowerCase().replace(/[^a-z0-9]/g, "_")).toUpperCase();
    const apiSecret = (
      Deno.env.get(`RAZORPAY_SECRET_${citySlug}`) ||
      (gw.api_secret || "")
    ).trim();

    if (!apiKey || !apiSecret) {
      return new Response(
        JSON.stringify({ error: "Razorpay API credentials not configured for this city" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Razorpay order via their API
    const razorpayUrl = "https://api.razorpay.com/v1/orders";
    const auth = btoa(`${apiKey}:${apiSecret}`);

    const orderPayload = {
      amount: Math.round(amount * 100), // Razorpay expects paise
      currency,
      receipt: receipt || `rcpt_${Date.now()}`,
      notes: booking_summary || {},
    };

    const rzpRes = await fetch(razorpayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(orderPayload),
    });

    if (!rzpRes.ok) {
      const errBody = await rzpRes.text();
      console.error("Razorpay order creation failed — HTTP", rzpRes.status);
      return new Response(
        JSON.stringify({ error: "Failed to create Razorpay order" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const order = await rzpRes.json();

    return new Response(
      JSON.stringify({
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        key_id: apiKey,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("create-razorpay-order error:", (err as Error).message);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
