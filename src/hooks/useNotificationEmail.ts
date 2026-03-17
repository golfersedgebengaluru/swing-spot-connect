import { supabase } from "@/integrations/supabase/client";

// Fire-and-forget email notification helper
export async function sendNotificationEmail(params: {
  user_id: string;
  template: string;
  subject: string;
  data: Record<string, any>;
}) {
  try {
    console.log("[Email] Sending:", params.template, "to user:", params.user_id);
    const res = await supabase.functions.invoke("send-notification-email", {
      body: params,
    });
    if (res.error) {
      console.error("[Email] Function error:", res.error);
    } else {
      console.log("[Email] Result:", res.data);
    }
  } catch (err) {
    console.error("[Email] Failed to send notification email:", err);
    // Non-blocking — don't throw
  }
}
