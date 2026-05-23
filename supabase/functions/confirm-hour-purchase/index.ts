import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require authenticated caller
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await authed.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return new Response(
        JSON.stringify({ error: "Missing required fields (order_id, payment_id, signature)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // 1. Find the pending purchase
    const { data: pending, error: pendingErr } = await adminClient
      .from("pending_purchases")
      .select("*")
      .eq("razorpay_order_id", razorpay_order_id)
      .single();

    if (pendingErr || !pending) {
      return new Response(
        JSON.stringify({ error: "Purchase record not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ensure the caller owns this pending purchase
    if (pending.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Already completed — idempotent
    if (pending.status === "completed") {
      return new Response(
        JSON.stringify({ status: "already_completed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. MANDATORY Razorpay signature verification
    const { data: gateway } = await adminClient
      .from("payment_gateways")
      .select("api_key, api_secret")
      .eq("city", pending.city)
      .eq("name", "razorpay")
      .eq("is_active", true)
      .single();

    const citySlug = pending.city.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const secret = Deno.env.get(`RAZORPAY_SECRET_${citySlug}`) || (gateway?.api_secret || "").trim();

    if (!secret) {
      return new Response(
        JSON.stringify({ error: "Payment gateway not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const data = `${razorpay_order_id}|${razorpay_payment_id}`;
    const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
    const computed = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (computed !== razorpay_signature) {
      await adminClient.from("pending_purchases").update({
        status: "signature_failed",
        error_message: "Payment signature verification failed",
      }).eq("id", pending.id);

      return new Response(
        JSON.stringify({ error: "Payment signature verification failed" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Atomically complete the purchase via DB function
    const description = `Purchased ${pending.package_hours}h package (₹${pending.package_price})`;
    const { data: result, error: rpcErr } = await adminClient.rpc("complete_hour_purchase", {
      p_user_id: pending.user_id,
      p_hours: pending.package_hours,
      p_amount: pending.package_price,
      p_currency: pending.currency,
      p_order_id: razorpay_order_id,
      p_payment_id: razorpay_payment_id,
      p_description: description,
      p_city: pending.city,
    });

    if (rpcErr) {
      await adminClient.from("pending_purchases").update({
        status: "error",
        error_message: rpcErr.message,
      }).eq("id", pending.id);

      console.error("complete_hour_purchase failed:", rpcErr.message);
      return new Response(
        JSON.stringify({ error: "Failed to complete purchase" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Notify admins
    try {
      const { data: profile } = await adminClient
        .from("profiles")
        .select("display_name")
        .eq("user_id", pending.user_id)
        .single();

      const memberName = profile?.display_name || "A member";

      // Get admin IDs for the city
      const { data: adminRoles } = await adminClient
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "site_admin"]);

      const adminIds = (adminRoles || []).map((r: any) => r.user_id);

      for (const adminId of adminIds) {
        await adminClient.from("notifications").insert({
          user_id: adminId,
          title: "💰 Hour Package Purchased",
          message: `${memberName} purchased ${pending.package_hours}h (₹${pending.package_price}) via Razorpay.`,
          type: "admin",
        });
      }

      // Notify the user
      await adminClient.from("notifications").insert({
        user_id: pending.user_id,
        title: "✅ Hours Credited",
        message: `${pending.package_hours} hours have been added to your balance.`,
        type: "purchase",
      });
    } catch (notifErr) {
      console.error("Notification failed (non-critical):", notifErr);
    }

    return new Response(
      JSON.stringify({ status: "completed", ...result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("confirm-hour-purchase error:", (err as Error).message);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
