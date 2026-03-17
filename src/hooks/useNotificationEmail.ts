import { supabase } from "@/integrations/supabase/client";

// Fire-and-forget email notification helper
export async function sendNotificationEmail(params: {
  user_id: string;
  template: string;
  subject: string;
  data: Record<string, any>;
}) {
  try {
    await supabase.functions.invoke("send-notification-email", {
      body: params,
    });
  } catch (err) {
    console.error("Failed to send notification email:", err);
    // Non-blocking — don't throw
  }
}
