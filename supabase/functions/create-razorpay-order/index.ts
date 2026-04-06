import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // This endpoint is public — guests (unauthenticated) must be able to create
  // Razorpay orders.  The actual booking security is enforced later in
  // calendar-sync (guest_booking / create_booking actions).

  try {
    const { amount, currency, city, booking_summary, receipt } = await req.json();

    if (!amount || !city) {
      return new Response(JSON.stringify({ error: "amount and city are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get Razorpay credentials for this city from payment_gateways table
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: gateway, error: gwError } = await supabase
      .from("payment_gateways")
      .select("api_key, api_secret, is_test_mode, is_active")
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

    const apiKey = (gateway.api_key || "").trim();
    const apiSecret = (gateway.api_secret || "").trim();

    if (!apiKey || !apiSecret) {
      return new Response(
        JSON.stringify({ error: "Razorpay API credentials not configured for this city" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Using Razorpay key: ${apiKey.substring(0, 12)}... (${apiKey.length} chars), secret: ${apiSecret.length} chars, test_mode: ${gateway.is_test_mode}`);

    // Create Razorpay order via their API
    const razorpayUrl = "https://api.razorpay.com/v1/orders";
    const auth = btoa(`${apiKey}:${apiSecret}`);

    const orderPayload = {
      amount: Math.round(amount * 100), // Razorpay expects paise
      currency: currency || "INR",
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
      console.error("Razorpay order creation failed:", errBody);
      return new Response(
        JSON.stringify({ error: "Failed to create Razorpay order", details: errBody }),
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
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
