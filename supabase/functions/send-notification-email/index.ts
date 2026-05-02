import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EmailPayload {
  user_id: string;
  template: string;
  subject: string;
  data: Record<string, any>;
}

const TEMPLATES: Record<string, (data: Record<string, any>) => string> = {
  booking_confirmed: (d) => `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:0">
      <div style="background:#2b3544;padding:32px 24px;text-align:center">
        <h1 style="color:#f5f0eb;margin:0;font-family:'Playfair Display',Georgia,serif;font-size:24px">Bay Booking Confirmed ✅</h1>
      </div>
      <div style="padding:32px 24px">
        <p style="color:#1a2332;font-size:16px;margin:0 0 16px">Hi ${d.display_name || "there"},</p>
        <p style="color:#1a2332;font-size:16px;margin:0 0 24px">Your bay booking has been confirmed!</p>
        <div style="background:#f0f3f7;border-radius:8px;padding:20px;margin:0 0 24px">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Location</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.city}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Bay</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.bay}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Date</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.date}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Time</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.time}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Duration</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.duration}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Hours Remaining</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.hours_remaining}</td></tr>
          </table>
        </div>
        ${d.add_to_calendar_url ? `
        <div style="text-align:center;margin:0 0 24px">
          <a href="${d.add_to_calendar_url}" style="display:inline-block;background:#2b3544;color:#f5f0eb;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:6px">📅 Add to Calendar</a>
          <p style="color:#6b7a8d;font-size:12px;margin:8px 0 0">Works with Google, Apple, Outlook & more</p>
        </div>` : ""}
        <p style="color:#6b7a8d;font-size:14px;margin:0 0 8px">${d._footer_text || `Need to cancel? You can do so up to ${d.cancellation_window || 24} hours before your booking. Please login to your account to cancel.`}</p>
      </div>
      <div style="background:#f0f3f7;padding:20px 24px;text-align:center">
        <p style="color:#6b7a8d;font-size:12px;margin:0">Golfer's Edge</p>
      </div>
    </div>`,

  coaching_pending: (d) => `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff">
      <div style="background:#2b3544;padding:32px 24px;text-align:center">
        <h1 style="color:#f5f0eb;margin:0;font-family:'Playfair Display',Georgia,serif;font-size:24px">🕐 Coaching Session Pending</h1>
      </div>
      <div style="padding:32px 24px">
        <p style="color:#1a2332;font-size:16px;margin:0 0 16px">Hi ${d.display_name || "there"},</p>
        <p style="color:#1a2332;font-size:16px;margin:0 0 24px">Your coaching session request has been submitted and is awaiting admin approval. No hours have been deducted yet.</p>
        <div style="background:#f0f3f7;border-radius:8px;padding:20px;margin:0 0 24px">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Location</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.city}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Bay</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.bay}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Date</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.date}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Time</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.time}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Duration</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.duration}</td></tr>
          </table>
        </div>
        <p style="color:#6b7a8d;font-size:14px;margin:0">You'll receive an email once the admin approves or declines your request.</p>
      </div>
      <div style="background:#f0f3f7;padding:20px 24px;text-align:center">
        <p style="color:#6b7a8d;font-size:12px;margin:0">Golfer's Edge</p>
      </div>
    </div>`,

  coaching_approved: (d) => `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff">
      <div style="background:#2b3544;padding:32px 24px;text-align:center">
        <h1 style="color:#f5f0eb;margin:0;font-family:'Playfair Display',Georgia,serif;font-size:24px">✅ Coaching Session Approved!</h1>
      </div>
      <div style="padding:32px 24px">
        <p style="color:#1a2332;font-size:16px;margin:0 0 16px">Hi ${d.display_name || "there"},</p>
        <p style="color:#1a2332;font-size:16px;margin:0 0 24px">Great news! Your coaching session has been approved.</p>
        <div style="background:#f0f3f7;border-radius:8px;padding:20px;margin:0 0 24px">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Location</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.city}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Bay</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.bay}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Date</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.date}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Time</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.time}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Hours Deducted</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.hours_deducted}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Hours Remaining</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.hours_remaining}</td></tr>
          </table>
        </div>
        ${d.cancellation_penalty ? `
        <div style="background:#fff8f0;border:1px solid #f0d4a8;border-radius:8px;padding:16px;margin:0 0 24px">
          <p style="color:#92610a;font-size:14px;font-weight:600;margin:0 0 6px">⚠ Cancellation Policy</p>
          <p style="color:#92610a;font-size:13px;margin:0">If you cancel this session, only ${d.cancellation_refund} of ${d.hours_deducted} will be refunded. A penalty of ${d.cancellation_penalty} will apply.</p>
        </div>` : ""}
      </div>
      <div style="background:#f0f3f7;padding:20px 24px;text-align:center">
        <p style="color:#6b7a8d;font-size:12px;margin:0">Golfer's Edge</p>
      </div>
    </div>`,

  coaching_rejected: (d) => `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff">
      <div style="background:#2b3544;padding:32px 24px;text-align:center">
        <h1 style="color:#f5f0eb;margin:0;font-family:'Playfair Display',Georgia,serif;font-size:24px">❌ Coaching Request Declined</h1>
      </div>
      <div style="padding:32px 24px">
        <p style="color:#1a2332;font-size:16px;margin:0 0 16px">Hi ${d.display_name || "there"},</p>
        <p style="color:#1a2332;font-size:16px;margin:0 0 24px">Unfortunately, your coaching session request has been declined. No hours were deducted from your balance.</p>
        ${d.admin_note ? `<p style="color:#1a2332;font-size:16px;margin:0 0 24px">Next available slot - ${d.admin_note}.</p><p style="color:#1a2332;font-size:16px;margin:0 0 24px">If this works for you, please return to your portal to book this slot.</p>` : ""}
        <div style="background:#f0f3f7;border-radius:8px;padding:20px;margin:0 0 24px">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Location</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.city}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Bay</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.bay}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Date</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.date}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Time</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.time}</td></tr>
          </table>
        </div>
        <p style="color:#6b7a8d;font-size:14px;margin:0">Please try booking a different slot or contact us for assistance.</p>
      </div>
      <div style="background:#f0f3f7;padding:20px 24px;text-align:center">
        <p style="color:#6b7a8d;font-size:12px;margin:0">Golfer's Edge</p>
      </div>
    </div>`,

  booking_cancelled: (d) => `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff">
      <div style="background:#2b3544;padding:32px 24px;text-align:center">
        <h1 style="color:#f5f0eb;margin:0;font-family:'Playfair Display',Georgia,serif;font-size:24px">Booking Cancelled</h1>
      </div>
      <div style="padding:32px 24px">
        <p style="color:#1a2332;font-size:16px;margin:0 0 16px">Hi ${d.display_name || "there"},</p>
        <p style="color:#1a2332;font-size:16px;margin:0 0 24px">${d._custom_body ? d._custom_body.replace("{{hours_refunded}}", d.hours_refunded) : `Your booking has been cancelled and ${d.hours_refunded}h has been refunded.`}</p>
        <div style="background:#f0f3f7;border-radius:8px;padding:20px;margin:0 0 24px">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Location</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.city}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Bay</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.bay}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Date</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.date}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Time</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.time}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Duration</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.duration}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Hours Refunded</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.hours_refunded}h</td></tr>
          </table>
        </div>
        ${d.remove_from_calendar_url ? `
        <div style="text-align:center;margin:0 0 8px">
          <a href="${d.remove_from_calendar_url}" style="display:inline-block;background:#e8edf3;color:#1a2332;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:6px">📅 Remove from Calendar</a>
          <p style="color:#6b7a8d;font-size:12px;margin:8px 0 0">Open this in Google, Apple, or Outlook to remove the event</p>
        </div>` : ""}
      </div>
      <div style="background:#f0f3f7;padding:20px 24px;text-align:center">
        <p style="color:#6b7a8d;font-size:12px;margin:0">Golfer's Edge</p>
      </div>
    </div>`,

  points_earned: (d) => `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff">
      <div style="background:#2b3544;padding:32px 24px;text-align:center">
        <h1 style="color:#f5f0eb;margin:0;font-family:'Playfair Display',Georgia,serif;font-size:24px">🎉 Points Awarded!</h1>
      </div>
      <div style="padding:32px 24px;text-align:center">
        <p style="color:#1a2332;font-size:16px;margin:0 0 16px">Hi ${d.display_name || "there"},</p>
        <div style="background:linear-gradient(135deg,#c78b1e,#d4a43a);border-radius:12px;padding:24px;margin:0 0 24px;display:inline-block">
          <p style="color:#fff;font-size:40px;font-weight:700;margin:0">+${d.points}</p>
          <p style="color:#fff;font-size:14px;margin:4px 0 0;opacity:0.9">reward points</p>
        </div>
        ${d.description ? `<p style="color:#6b7a8d;font-size:14px;margin:0 0 16px">Reason: ${d.description}</p>` : ""}
        <p style="color:#1a2332;font-size:16px;margin:0">Your balance: <strong>${d.total_points} points</strong></p>
      </div>
      <div style="background:#f0f3f7;padding:20px 24px;text-align:center">
        <p style="color:#6b7a8d;font-size:12px;margin:0">Golfer's Edge</p>
      </div>
    </div>`,

  points_redeemed: (d) => `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff">
      <div style="background:#2b3544;padding:32px 24px;text-align:center">
        <h1 style="color:#f5f0eb;margin:0;font-family:'Playfair Display',Georgia,serif;font-size:24px">🎁 Reward Redeemed</h1>
      </div>
      <div style="padding:32px 24px;text-align:center">
        <p style="color:#1a2332;font-size:16px;margin:0 0 24px">Hi ${d.display_name || "there"},</p>
        <div style="background:#f0f3f7;border-radius:8px;padding:20px;margin:0 0 24px">
          <p style="color:#1a2332;font-size:18px;font-weight:600;margin:0 0 8px">${d.reward_name}</p>
          <p style="color:#6b7a8d;font-size:14px;margin:0">${d.points} points redeemed</p>
        </div>
        <p style="color:#1a2332;font-size:16px;margin:0">Remaining balance: <strong>${d.total_points} points</strong></p>
      </div>
      <div style="background:#f0f3f7;padding:20px 24px;text-align:center">
        <p style="color:#6b7a8d;font-size:12px;margin:0">Golfer's Edge</p>
      </div>
    </div>`,

  league_update: (d) => `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff">
      <div style="background:#2b3544;padding:32px 24px;text-align:center">
        <h1 style="color:#f5f0eb;margin:0;font-family:'Playfair Display',Georgia,serif;font-size:24px">🏆 Leaderboard Update</h1>
      </div>
      <div style="padding:32px 24px">
        <p style="color:#1a2332;font-size:16px;margin:0 0 24px">Hi ${d.display_name || "there"},</p>
        <p style="color:#1a2332;font-size:16px;margin:0 0 16px">${d.message}</p>
      </div>
      <div style="background:#f0f3f7;padding:20px 24px;text-align:center">
        <p style="color:#6b7a8d;font-size:12px;margin:0">Golfer's Edge</p>
      </div>
    </div>`,

  low_hours_alert: (d) => `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff">
      <div style="background:#e97316;padding:32px 24px;text-align:center">
        <h1 style="color:#fff;margin:0;font-family:'Playfair Display',Georgia,serif;font-size:24px">⚠️ Low Hours Alert</h1>
      </div>
      <div style="padding:32px 24px">
        <p style="color:#1a2332;font-size:16px;margin:0 0 16px">Hi ${d.display_name || "there"},</p>
        <p style="color:#1a2332;font-size:16px;margin:0 0 24px">${d._custom_body ? d._custom_body.replace("{{hours_remaining}}", d.hours_remaining) : `You only have ${d.hours_remaining} hour(s) remaining. Please login to your account to purchase more hours.`}</p>
        <div style="background:#fff7ed;border:2px solid #e97316;border-radius:12px;padding:24px;margin:0 0 24px;text-align:center">
          <p style="color:#e97316;font-size:40px;font-weight:700;margin:0">${d.hours_remaining}</p>
          <p style="color:#9a3412;font-size:14px;margin:4px 0 0">hour(s) remaining</p>
        </div>
        <div style="text-align:center;margin:0 0 24px">
          <a href="${d.purchase_url || '#'}" style="display:inline-block;background:#e97316;color:#fff;font-size:16px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none">Purchase More Hours</a>
        </div>
      </div>
      <div style="background:#f0f3f7;padding:20px 24px;text-align:center">
        <p style="color:#6b7a8d;font-size:12px;margin:0">Golfer's Edge</p>
      </div>
    </div>`,

  admin_new_booking: (d) => `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff">
      <div style="background:#2b3544;padding:32px 24px;text-align:center">
        <h1 style="color:#f5f0eb;margin:0;font-family:'Playfair Display',Georgia,serif;font-size:24px">📅 New Booking</h1>
      </div>
      <div style="padding:32px 24px">
        <p style="color:#1a2332;font-size:16px;margin:0 0 16px">Hi ${d.admin_name || "Admin"},</p>
        <p style="color:#1a2332;font-size:16px;margin:0 0 24px">A new ${d.session_type || "practice"} booking has been made${d.is_guest ? " by a guest" : ""}.</p>
        <div style="background:#f0f3f7;border-radius:8px;padding:20px;margin:0 0 24px">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Member</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.member_name || "Unknown"}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Location</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.city}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Bay</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.bay}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Date</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.date}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Time</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.time}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Duration</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.duration}</td></tr>
          </table>
        </div>
      </div>
      <div style="background:#f0f3f7;padding:20px 24px;text-align:center">
        <p style="color:#6b7a8d;font-size:12px;margin:0">Golfer's Edge — Admin Notification</p>
      </div>
    </div>`,

  admin_coaching_request: (d) => `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff">
      <div style="background:#e97316;padding:32px 24px;text-align:center">
        <h1 style="color:#fff;margin:0;font-family:'Playfair Display',Georgia,serif;font-size:24px">🕐 Coaching Request — Action Required</h1>
      </div>
      <div style="padding:32px 24px">
        <p style="color:#1a2332;font-size:16px;margin:0 0 16px">Hi ${d.admin_name || "Admin"},</p>
        <p style="color:#1a2332;font-size:16px;margin:0 0 24px">A new coaching session request requires your approval.</p>
        <div style="background:#f0f3f7;border-radius:8px;padding:20px;margin:0 0 24px">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Member</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.member_name || "Unknown"}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Location</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.city}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Bay</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.bay}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Date</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.date}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Time</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.time}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Duration</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.duration}</td></tr>
          </table>
        </div>
        <p style="color:#1a2332;font-size:14px;margin:0">Please log in to the admin panel to approve or decline this request.</p>
      </div>
      <div style="background:#f0f3f7;padding:20px 24px;text-align:center">
        <p style="color:#6b7a8d;font-size:12px;margin:0">Golfer's Edge — Admin Notification</p>
      </div>
    </div>`,

  admin_booking_cancelled: (d) => `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff">
      <div style="background:#dc2626;padding:32px 24px;text-align:center">
        <h1 style="color:#fff;margin:0;font-family:'Playfair Display',Georgia,serif;font-size:24px">🚫 Booking Cancelled</h1>
      </div>
      <div style="padding:32px 24px">
        <p style="color:#1a2332;font-size:16px;margin:0 0 16px">Hi ${d.admin_name || "Admin"},</p>
        <p style="color:#1a2332;font-size:16px;margin:0 0 24px">${d.cancelled_by === "admin" ? "An admin has cancelled" : `${d.member_name || "A member"} has cancelled`} a ${d.session_type || "practice"} booking.</p>
        <div style="background:#f0f3f7;border-radius:8px;padding:20px;margin:0 0 24px">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Member</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.member_name || "Unknown"}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Location</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.city}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Bay</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.bay}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Date</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.date}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Time</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.time}</td></tr>
            ${d.hours_refunded ? `<tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Hours Refunded</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.hours_refunded}h</td></tr>` : ""}
          </table>
        </div>
      </div>
      <div style="background:#f0f3f7;padding:20px 24px;text-align:center">
        <p style="color:#6b7a8d;font-size:12px;margin:0">Golfer's Edge — Admin Notification</p>
      </div>
    </div>`,

  guest_booking_confirmed: (d) => `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:0">
      <div style="background:#2b3544;padding:32px 24px;text-align:center">
        <h1 style="color:#f5f0eb;margin:0;font-family:'Playfair Display',Georgia,serif;font-size:24px">Booking Confirmed ✅</h1>
      </div>
      <div style="padding:32px 24px">
        <p style="color:#1a2332;font-size:16px;margin:0 0 16px">Hi ${d.display_name || "there"},</p>
        <p style="color:#1a2332;font-size:16px;margin:0 0 24px">Your booking has been confirmed! Here are your details:</p>
        <div style="background:#f0f3f7;border-radius:8px;padding:20px;margin:0 0 24px">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Location</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.city}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Bay</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.bay}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Date</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.date}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Time</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.time}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Duration</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.duration}</td></tr>
            ${d.amount ? `<tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Amount Paid</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">₹${d.amount}</td></tr>` : ""}
          </table>
        </div>
        ${d.add_to_calendar_url ? `
        <div style="text-align:center;margin:0 0 24px">
          <a href="${d.add_to_calendar_url}" style="display:inline-block;background:#2b3544;color:#f5f0eb;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:6px">📅 Add to Calendar</a>
          <p style="color:#6b7a8d;font-size:12px;margin:8px 0 0">Works with Google, Apple, Outlook & more</p>
        </div>` : ""}
        <p style="color:#6b7a8d;font-size:14px;margin:0 0 8px">Thank you for booking with us. We look forward to seeing you!</p>
      </div>
      <div style="background:#f0f3f7;padding:20px 24px;text-align:center">
        <p style="color:#6b7a8d;font-size:12px;margin:0">Golfer's Edge</p>
      </div>
    </div>`,

  coaching_session_added: (d) => `
    <div style="font-family:'DM Sans',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff">
      <div style="background:#2b3544;padding:32px 24px;text-align:center">
        <h1 style="color:#f5f0eb;margin:0;font-family:'Playfair Display',Georgia,serif;font-size:24px">${d.is_new ? "📘 New Coaching Session" : "📘 Coaching Session Updated"}</h1>
      </div>
      <div style="padding:32px 24px">
        <p style="color:#1a2332;font-size:16px;margin:0 0 16px">Hi ${d.display_name || "there"},</p>
        <p style="color:#1a2332;font-size:16px;margin:0 0 24px">
          ${d.coach_name || "Your coach"} ${d.is_new ? "has added new session notes for you" : "updated your session notes"}.
        </p>
        <div style="background:#f0f3f7;border-radius:8px;padding:20px;margin:0 0 24px">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Coach</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.coach_name || "—"}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7a8d;font-size:14px">Session Date</td><td style="padding:6px 0;color:#1a2332;font-size:14px;font-weight:600;text-align:right">${d.session_date || "—"}</td></tr>
          </table>
        </div>
        ${d.session_url ? `
        <div style="text-align:center;margin:0 0 24px">
          <a href="${d.session_url}" style="display:inline-block;background:#2b3544;color:#f5f0eb;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:6px">View Session Notes</a>
        </div>` : ""}
        <p style="color:#6b7a8d;font-size:14px;margin:0">Login to your account to view drills, progress notes, and any video links your coach attached.</p>
      </div>
      <div style="background:#f0f3f7;padding:20px 24px;text-align:center">
        <p style="color:#6b7a8d;font-size:12px;margin:0">Golfer's Edge</p>
      </div>
    </div>`,
};

// Template to preference field mapping
const TEMPLATE_PREF_MAP: Record<string, string> = {
  booking_confirmed: "booking_confirmed",
  coaching_pending: "booking_confirmed",
  coaching_approved: "booking_confirmed",
  coaching_rejected: "booking_confirmed",
  coaching_session_added: "booking_confirmed",
  booking_cancelled: "booking_cancelled",
  booking_rescheduled: "booking_rescheduled",
  points_earned: "points_earned",
  points_redeemed: "points_redeemed",
  league_update: "league_updates",
  low_hours_alert: "booking_confirmed",
  // Admin + guest templates — no user preference check (always send)
  admin_new_booking: "",
  admin_coaching_request: "",
  admin_booking_cancelled: "",
  guest_booking_confirmed: "",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Body size limit
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > 50_000) {
      return new Response(JSON.stringify({ error: "Request body too large" }), {
        status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth check
    const authHeader = req.headers.get("Authorization");
    let callerId: string | null = null;
    
    if (authHeader?.startsWith("Bearer ")) {
      const supabaseUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user: authUser } } = await supabaseUser.auth.getUser();
      callerId = authUser?.id || null;
    }

    const body = await req.json();
    const { user_id, template, subject, data, is_test, recipient_email } = body as EmailPayload & { is_test?: boolean; recipient_email?: string };

    if (!template || !subject) {
      return new Response(JSON.stringify({ error: "Missing required fields: template, subject" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine recipient email: either from direct recipient_email param (for guests) or profile lookup
    let recipientEmail: string | null = recipient_email || null;
    let profileDisplayName: string | null = data?.display_name || null;

    if (!recipientEmail && user_id) {
      // Get user profile for email — dual-key lookup (user_id first, then id)
      let profile: { email: string | null; display_name: string | null; user_id: string | null } | null = null;
      const { data: profileByUserId } = await supabaseAdmin
        .from("profiles")
        .select("email, display_name, user_id")
        .eq("user_id", user_id)
        .single();
      profile = profileByUserId;

      if (!profile?.email) {
        // Fallback: try matching by profile primary key (id)
        const { data: profileById } = await supabaseAdmin
          .from("profiles")
          .select("email, display_name, user_id")
          .eq("id", user_id)
          .single();
        profile = profileById;
      }

      if (!profile?.email) {
        return new Response(JSON.stringify({ error: "User email not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      recipientEmail = profile.email;
      profileDisplayName = profileDisplayName || profile.display_name;
    }

    if (!recipientEmail) {
      return new Response(JSON.stringify({ error: "No recipient email available" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check email preferences (skip for test emails and guest emails without user_id)
    if (!is_test && user_id) {
      const prefField = TEMPLATE_PREF_MAP[template];
      if (prefField) {
        const { data: prefs } = await supabaseAdmin
          .from("email_preferences")
          .select("*")
          .eq("user_id", user_id)
          .single();

        if (prefs && prefs[prefField] === false) {
          await supabaseAdmin.from("email_log").insert({
            user_id,
            recipient_email: recipientEmail,
            template,
            subject,
            status: "suppressed",
            metadata: { reason: "user_opted_out", data },
          });
          return new Response(JSON.stringify({ success: true, status: "suppressed", reason: "user_opted_out" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

    // Skip rate limit for critical notification templates
      const RATE_LIMIT_EXEMPT_TEMPLATES = [
        "booking_confirmed",
        "booking_cancelled",
        "coaching_pending",
        "coaching_approved",
        "coaching_rejected",
        "coaching_session_added",
        "low_hours_alert",
        "admin_new_booking",
        "admin_coaching_request",
        "admin_booking_cancelled",
        "guest_booking_confirmed",
      ];

      if (!RATE_LIMIT_EXEMPT_TEMPLATES.includes(template)) {
        // Get configurable rate limit from admin_config (default 10)
        const { data: rateLimitConfig } = await supabaseAdmin
          .from("admin_config")
          .select("value")
          .eq("key", "email_rate_limit_per_hour")
          .single();
        const maxPerHour = rateLimitConfig?.value ? parseInt(rateLimitConfig.value, 10) : 10;

        const { data: rateLimitOk } = await supabaseAdmin.rpc("check_email_rate_limit", {
          p_user_id: user_id,
          p_max_per_hour: maxPerHour,
        });

        if (!rateLimitOk) {
          await supabaseAdmin.from("email_log").insert({
            user_id,
            recipient_email: recipientEmail,
            template,
            subject,
            status: "rate_limited",
            metadata: { data },
          });
          return new Response(JSON.stringify({ success: false, status: "rate_limited" }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } // end rate limit exempt check

      // Duplicate check — skip for critical booking/admin templates since
      // a user may legitimately book, cancel, and rebook within minutes.
      if (!RATE_LIMIT_EXEMPT_TEMPLATES.includes(template)) {
        const { data: recentEmails } = await supabaseAdmin
          .from("email_log")
          .select("id")
          .eq("user_id", user_id)
          .eq("template", template)
          .eq("status", "sent")
          .gte("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
          .limit(1);

        if (recentEmails && recentEmails.length > 0) {
          return new Response(JSON.stringify({ success: true, status: "deduplicated" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Build HTML from template
    const templateFn = TEMPLATES[template];
    if (!templateFn) {
      return new Response(JSON.stringify({ error: `Unknown template: ${template}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch customizable template content from admin_config
    const { data: tplConfigs } = await supabaseAdmin
      .from("admin_config")
      .select("key, value")
      .like("key", "email_tpl_%");
    const tplMap: Record<string, string> = {};
    tplConfigs?.forEach((c: any) => { tplMap[c.key] = c.value; });

    const TEMPLATE_CONTENT_MAP: Record<string, string> = {
      booking_confirmed: "email_tpl_booking_confirmed_footer",
      booking_cancelled: "email_tpl_booking_cancelled_body",
      points_earned: "email_tpl_points_earned_body",
      points_redeemed: "email_tpl_points_redeemed_body",
      league_update: "email_tpl_league_update_body",
      low_hours_alert: "email_tpl_low_hours_alert_body",
    };

    const contentKey = TEMPLATE_CONTENT_MAP[template];
    const customContent = contentKey ? tplMap[contentKey] : undefined;

    // Override subject if custom subject is configured for this template
    const customSubjectKey = tplMap["email_tpl_low_hours_alert_subject"];
    const finalSubject = template === "low_hours_alert" && customSubjectKey ? customSubjectKey : subject;

    const templateData = {
      ...data,
      display_name: data.display_name || profileDisplayName,
      _footer_text: template === "booking_confirmed" ? customContent : undefined,
      _custom_body: customContent,
    };
    const html = templateFn(templateData);

    // Get configurable sender email and name
    const { data: senderConfigs } = await supabaseAdmin
      .from("admin_config")
      .select("key, value")
      .in("key", ["sender_email", "sender_name"]);
    const senderMap: Record<string, string> = {};
    senderConfigs?.forEach((c: any) => { senderMap[c.key] = c.value; });
    const senderEmail = senderMap["sender_email"] || "notify@golfersedge.in";
    const senderName = senderMap["sender_name"] || "Golfer's Edge";

    // Create pending log entry
    const { data: logEntry } = await supabaseAdmin.from("email_log").insert({
      user_id: user_id || "00000000-0000-0000-0000-000000000000",
      recipient_email: recipientEmail,
      template,
      subject: finalSubject,
      status: "pending",
      metadata: { data },
    }).select("id").single();

    // Send via Resend
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${senderName} <${senderEmail}>`,
        to: [recipientEmail],
        subject: finalSubject,
        html,
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      if (logEntry?.id) {
        await supabaseAdmin.from("email_log").update({
          status: "failed",
          error_message: JSON.stringify(resendData),
        }).eq("id", logEntry.id);
      }
      throw new Error(`Resend error: ${JSON.stringify(resendData)}`);
    }

    if (logEntry?.id) {
      await supabaseAdmin.from("email_log").update({
        status: "sent",
        resend_id: resendData.id,
      }).eq("id", logEntry.id);
    }

    return new Response(JSON.stringify({ success: true, status: "sent", resend_id: resendData.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Email send error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
