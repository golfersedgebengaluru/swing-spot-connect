import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const Schema = z.object({
  competition_id: z.string().uuid(),
  player_name: z.string().min(1).max(80),
  phone: z.string().min(5).max(20),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const parsed = Schema.safeParse(await req.json());
    if (!parsed.success) return ok({ success: false, error: "Invalid request" });
    const { competition_id, player_name, phone } = parsed.data;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: comp, error: compErr } = await supabase
      .from("quick_competitions")
      .select("id, status, entry_type, entry_fee, entry_currency, tenant_id")
      .eq("id", competition_id)
      .maybeSingle();
    if (compErr || !comp) return ok({ success: false, error: "Competition not found" });
    if (comp.status !== "active") return ok({ success: false, error: "Competition is closed" });
    if (comp.entry_type !== "paid" || !comp.entry_fee || Number(comp.entry_fee) <= 0)
      return ok({ success: false, error: "This competition is not a paid entry" });

    const { data: tenant } = await supabase
      .from("tenants").select("city").eq("id", comp.tenant_id).maybeSingle();
    const city = tenant?.city;
    if (!city) return ok({ success: false, error: "Tenant city not configured" });

    // Check if entry already exists
    const { data: existing } = await supabase
      .from("qc_entries")
      .select("id, status, razorpay_order_id")
      .eq("competition_id", competition_id)
      .eq("phone", phone.trim())
      .maybeSingle();
    if (existing?.status === "paid")
      return ok({ success: false, error: "This phone number has already entered" });

    // Razorpay credentials for this city
    const { data: gateway } = await supabase
      .from("payment_gateways")
      .select("api_key, api_secret, city_slug")
      .eq("city", city).eq("name", "razorpay").eq("is_active", true).single();
    if (!gateway) return ok({ success: false, error: "Payments not configured for this city" });

    const apiKey = (gateway.api_key || "").trim();
    const citySlug = (gateway.city_slug || city.toLowerCase().replace(/[^a-z0-9]/g, "_")).toUpperCase();
    const apiSecret = (Deno.env.get(`RAZORPAY_SECRET_${citySlug}`) || gateway.api_secret || "").trim();
    if (!apiKey || !apiSecret) return ok({ success: false, error: "Razorpay credentials missing" });

    const amountPaise = Math.round(Number(comp.entry_fee) * 100);
    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(`${apiKey}:${apiSecret}`)}`,
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: comp.entry_currency || "INR",
        receipt: `qc_${competition_id.slice(0, 8)}_${Date.now().toString().slice(-6)}`,
        notes: { competition_id, player_name, phone },
      }),
    });
    if (!rzpRes.ok) {
      console.error("Razorpay order failed", await rzpRes.text());
      return ok({ success: false, error: "Could not create payment order" });
    }
    const order = await rzpRes.json();

    // Upsert pending entry
    const entryPayload = {
      competition_id,
      player_name: player_name.trim(),
      phone: phone.trim(),
      amount: Number(comp.entry_fee),
      currency: comp.entry_currency || "INR",
      razorpay_order_id: order.id,
      status: "pending" as const,
    };
    if (existing) {
      await supabase.from("qc_entries").update(entryPayload).eq("id", existing.id);
    } else {
      await supabase.from("qc_entries").insert(entryPayload);
    }

    return ok({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: apiKey,
    });
  } catch (err) {
    console.error("qc-create-entry-order error", (err as Error).message);
    return ok({ success: false, error: "Internal error" });
  }
});
