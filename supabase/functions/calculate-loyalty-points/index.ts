import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LoyaltyEvent {
  user_id: string;
  event_type: string; // walkin, birdie_usage, eagle_usage, coaching, practice, renewal
  amount_spent?: number; // for walkin (₹)
  hours_used?: number; // for hour-based events
  is_off_peak?: boolean; // optional manual override; auto-detected from bay config if omitted
  is_coaching?: boolean;
  staff_id: string;
  reason?: string;
  city?: string; // used for auto off-peak detection
  booking_start_time?: string; // ISO string, used for auto off-peak detection
  metadata?: Record<string, any>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const event: LoyaltyEvent = await req.json();

    if (!event.user_id || !event.event_type || !event.staff_id) {
      return new Response(JSON.stringify({ error: "Missing required fields: user_id, event_type, staff_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 0. Auto-detect off-peak if not explicitly provided
    let isOffPeak = event.is_off_peak;
    if (isOffPeak === undefined && event.city && event.booking_start_time) {
      const { data: bayConfig } = await supabase
        .from("bays")
        .select("peak_start, peak_end")
        .eq("city", event.city)
        .eq("is_active", true)
        .limit(1)
        .single();

      if (bayConfig?.peak_start && bayConfig?.peak_end) {
        const bookingTime = new Date(event.booking_start_time);
        const timeStr = bookingTime.toTimeString().slice(0, 5); // "HH:MM"
        isOffPeak = timeStr < bayConfig.peak_start || timeStr >= bayConfig.peak_end;
      }
    }

    // 1. Fetch active earning rules for this event type
    const { data: rules } = await supabase
      .from("loyalty_earning_rules")
      .select("*")
      .eq("event_type", event.event_type)
      .eq("is_active", true);

    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ points: 0, message: "No active rules for this event type" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Fetch active multipliers
    const { data: multipliers } = await supabase
      .from("loyalty_multipliers")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");

    // 3. Fetch user profile for status checks
    const { data: profile } = await supabase
      .from("profiles")
      .select("tier, points, user_type")
      .eq("user_id", event.user_id)
      .single();

    // Gate: skip automated points for guest / non-registered users
    const gatedTypes = ["guest", "non-registered"];
    if (!profile || gatedTypes.includes(profile.user_type)) {
      return new Response(JSON.stringify({
        points: 0,
        message: `Skipped: user_type is '${profile?.user_type ?? "unknown"}'. Guests earn points only via admin allocation.`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Get user visit count for first-visits multiplier
    const { count: visitCount } = await supabase
      .from("points_transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", event.user_id)
      .eq("type", "allocation");

    // 5. Calculate base points from the rule
    const rule = rules[0];
    let basePoints = 0;

    switch (rule.rate_unit) {
      case "per_100_spent":
        basePoints = Math.floor((event.amount_spent || 0) / 100) * rule.base_rate;
        break;
      case "per_hour":
        basePoints = Math.floor((event.hours_used || 0) * rule.base_rate);
        break;
      case "flat":
        basePoints = rule.base_rate;
        break;
    }

    if (basePoints <= 0) {
      return new Response(JSON.stringify({ points: 0, message: "No points to award (base = 0)" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Evaluate and stack multipliers
    let totalMultiplier = 1.0;
    const appliedMultipliers: { name: string; value: number }[] = [];

    for (const m of multipliers || []) {
      let applies = false;

      switch (m.condition_type) {
        case "off_peak":
          applies = !!(isOffPeak ?? event.is_off_peak);
          break;
        case "coaching":
          applies = !!event.is_coaching || event.event_type === "coaching";
          break;
        case "first_visits": {
          const maxVisits = (m.condition_value as any)?.max_visits ?? 3;
          applies = (visitCount || 0) < maxVisits;
          break;
        }
        case "eagle_status":
          applies = profile?.tier === "eagle" || profile?.user_type === "eagle";
          break;
        case "birdie_status":
          applies = profile?.tier === "birdie" || profile?.user_type === "birdie";
          break;
      }

      if (applies) {
        if (m.is_stackable) {
          totalMultiplier *= m.multiplier;
        } else {
          totalMultiplier = Math.max(totalMultiplier, m.multiplier);
        }
        appliedMultipliers.push({ name: m.name, value: m.multiplier });
      }
    }

    const finalPoints = Math.round(basePoints * totalMultiplier);

    // 7. Check for coaching follow-through bonus
    let bonusPoints = 0;
    const appliedBonuses: string[] = [];

    if (event.event_type === "practice") {
      const { data: bonuses } = await supabase
        .from("loyalty_bonuses")
        .select("*")
        .eq("trigger_type", "coaching_followup")
        .eq("is_active", true);

      if (bonuses && bonuses.length > 0) {
        const bonus = bonuses[0];
        const withinHours = (bonus.trigger_conditions as any)?.within_hours ?? 24;

        // Check if there was a coaching session within the specified hours
        const cutoff = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString();
        const { count: recentCoaching } = await supabase
          .from("points_transactions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", event.user_id)
          .eq("event_type", "coaching")
          .gte("created_at", cutoff);

        if ((recentCoaching || 0) > 0) {
          if (bonus.bonus_type === "percentage") {
            bonusPoints = Math.round(finalPoints * (bonus.bonus_value / 100));
          } else {
            bonusPoints = bonus.bonus_value;
          }
          appliedBonuses.push(bonus.name);
        }
      }
    }

    const totalPoints = finalPoints + bonusPoints;

    // 8. Award points atomically
    const { error: rpcErr } = await supabase.rpc("increment_user_points", {
      p_user_id: event.user_id,
      p_delta: totalPoints,
    });

    // Fallback if RPC doesn't exist — direct update
    if (rpcErr) {
      await supabase
        .from("profiles")
        .update({ points: (profile?.points || 0) + totalPoints })
        .eq("user_id", event.user_id);
    }

    // 9. Log the transaction with full audit trail
    await supabase.from("points_transactions").insert({
      user_id: event.user_id,
      type: "allocation",
      points: totalPoints,
      description: event.reason || `${rule.label} points`,
      created_by: event.staff_id,
      rule_id: rule.id,
      base_points: basePoints,
      multipliers_applied: appliedMultipliers,
      event_type: event.event_type,
      event_metadata: {
        ...event.metadata,
        amount_spent: event.amount_spent,
        hours_used: event.hours_used,
        is_off_peak: event.is_off_peak,
        total_multiplier: totalMultiplier,
        bonus_points: bonusPoints,
        applied_bonuses: appliedBonuses,
      },
      reason: event.reason || `Auto: ${rule.label}`,
    });

    // 10. Send notification
    await supabase.from("notifications").insert({
      user_id: event.user_id,
      title: "🎉 Points Earned",
      message: `You earned ${totalPoints} EDGE points! ${appliedMultipliers.length > 0 ? `(${appliedMultipliers.map(m => `${m.name} ${m.value}×`).join(", ")})` : ""}`,
      type: "reward",
    });

    // 11. Check milestones (non-blocking)
    checkMilestones(supabase, event.user_id, event.staff_id).catch(console.error);

    return new Response(JSON.stringify({
      base_points: basePoints,
      multiplier: totalMultiplier,
      multipliers_applied: appliedMultipliers,
      bonus_points: bonusPoints,
      bonuses_applied: appliedBonuses,
      total_points: totalPoints,
      rule_applied: rule.label,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Loyalty calculation error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function checkMilestones(supabase: any, userId: string, staffId: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Get or create monthly progress
  const { data: existing } = await supabase
    .from("loyalty_user_progress")
    .select("*")
    .eq("user_id", userId)
    .eq("period_type", "monthly")
    .eq("period_start", monthStart.toISOString().split("T")[0])
    .maybeSingle();

  // Calculate actual hours this month from bookings
  const { data: bookings } = await supabase
    .from("bookings")
    .select("duration_minutes")
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .gte("start_time", monthStart.toISOString())
    .lte("start_time", monthEnd.toISOString());

  const totalHours = (bookings || []).reduce((sum: number, b: any) => sum + (b.duration_minutes || 0) / 60, 0);
  const achievedIds = existing?.milestones_achieved || [];

  // Upsert progress
  await supabase.from("loyalty_user_progress").upsert({
    user_id: userId,
    period_type: "monthly",
    period_start: monthStart.toISOString().split("T")[0],
    period_end: monthEnd.toISOString().split("T")[0],
    hours_logged: totalHours,
    milestones_achieved: achievedIds,
    visit_count: (existing?.visit_count || 0) + 1,
  }, { onConflict: "user_id,period_type,period_start" });

  // Check milestones
  const { data: milestones } = await supabase
    .from("loyalty_milestones")
    .select("*")
    .eq("is_active", true)
    .eq("milestone_type", "monthly")
    .lte("threshold_hours", totalHours);

  for (const m of milestones || []) {
    if (achievedIds.includes(m.id)) continue;

    // Award milestone bonus
    await supabase.rpc("increment_user_points", { p_user_id: userId, p_delta: m.bonus_points }).catch(() => {});

    await supabase.from("points_transactions").insert({
      user_id: userId,
      type: "allocation",
      points: m.bonus_points,
      description: `Milestone: ${m.name}`,
      created_by: staffId,
      event_type: "milestone",
      reason: `Milestone achieved: ${m.name} (${m.threshold_hours}h)`,
      event_metadata: { milestone_id: m.id, hours_logged: totalHours },
    });

    await supabase.from("notifications").insert({
      user_id: userId,
      title: "🏆 Milestone Reached!",
      message: `You hit ${m.threshold_hours}h this month! +${m.bonus_points} bonus points!`,
      type: "reward",
    });

    // Update achieved list
    achievedIds.push(m.id);
    await supabase.from("loyalty_user_progress").update({ milestones_achieved: achievedIds })
      .eq("user_id", userId).eq("period_type", "monthly").eq("period_start", monthStart.toISOString().split("T")[0]);
  }
}
