// Shared booking notification logic.
//
// Both booking-creation paths in calendar-sync must notify identically:
//   1. `create_booking`                    — browser-driven flow
//   2. `finalize_pending_member_booking`   — payment-webhook recovery flow
//
// The two paths previously duplicated this block, drifted, and the recovery
// path silently sent nothing (members got no confirmation, admins no alert).
// Keeping it here means one implementation, one place to test.

export interface EmailPayload {
  user_id: string;
  template: string;
  subject: string;
  data: Record<string, unknown>;
}

export type EmailSender = (payload: EmailPayload) => Promise<void>;

/** Default sender — posts to the send-notification-email edge function. */
export const defaultEmailSender: EmailSender = async (payload) => {
  const env = (globalThis as any).Deno?.env;
  const baseUrl = env?.get("SUPABASE_URL");
  const serviceKey = env?.get("SUPABASE_SERVICE_ROLE_KEY");
  await fetch(`${baseUrl}/functions/v1/send-notification-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(payload),
  });
};

export interface BookingNotificationInput {
  userId: string;
  city: string;
  bayLabel: string;
  isCoaching: boolean;
  /** Long date, e.g. "Friday, 7 August 2026" */
  dateLabel: string;
  /** "08:00 – 09:00" */
  timeLabel: string;
  /** Combined date+time used in the in-app admin message */
  dateTimeLabel: string;
  /** "1h" */
  duration: string;
  /** Member's remaining hours, or a note when paid via gateway */
  hoursRemaining: string;
  addToCalendarUrl?: string | null;
  /** Falls back when the profile has no display name */
  memberNameFallback?: string;
  /** When present, wording reflects a paid (gateway) booking */
  paymentMethod?: string | null;
}

export interface BookingNotificationHelpers {
  resolveDisplayName: (admin: any, userId: string, fallback: string) => Promise<string>;
  getAdminIds: (admin: any, city: string, excludeUserId?: string) => Promise<string[]>;
  notifyAdminsInApp: (
    admin: any,
    adminIds: string[],
    title: string,
    message: string,
    actionUrl?: string,
  ) => Promise<void>;
  notifyAdminsByEmail: (
    admin: any,
    adminIds: string[],
    template: string,
    subject: string,
    data: Record<string, unknown>,
  ) => Promise<void>;
  sendEmail?: EmailSender;
}

export interface BookingNotificationResult {
  memberEmailSent: boolean;
  adminsNotified: boolean;
  errors: string[];
}

/**
 * Sends the member "booking confirmed" email plus the admin in-app + email
 * alerts. Every step is best-effort: a notification failure must never fail
 * an already-confirmed booking.
 */
export async function sendBookingConfirmedNotifications(
  admin: any,
  input: BookingNotificationInput,
  helpers: BookingNotificationHelpers,
): Promise<BookingNotificationResult> {
  const sendEmail = helpers.sendEmail ?? defaultEmailSender;
  const errors: string[] = [];
  const paid = Boolean(input.paymentMethod);

  let memberEmailSent = false;
  try {
    await sendEmail({
      user_id: input.userId,
      template: "booking_confirmed",
      subject: "✅ Bay Booking Confirmed!",
      data: {
        city: input.city,
        bay: input.bayLabel,
        date: input.dateLabel,
        time: input.timeLabel,
        duration: input.duration,
        hours_remaining: input.hoursRemaining,
        add_to_calendar_url: input.addToCalendarUrl ?? null,
      },
    });
    memberEmailSent = true;
  } catch (e) {
    errors.push(`member email: ${(e as Error).message}`);
    console.error("Failed to send booking confirmation email:", (e as Error).message);
  }

  let adminsNotified = false;
  try {
    const memberName = await helpers.resolveDisplayName(
      admin,
      input.userId,
      input.memberNameFallback || "A member",
    );
    const adminIds = await helpers.getAdminIds(admin, input.city, input.userId);
    const title = paid ? "📅 New Booking (Paid)" : "📅 New Booking";
    const coachingSuffix = input.isCoaching ? " (Coaching)" : "";
    const paidSuffix = paid ? ` — paid via ${input.paymentMethod}.` : ".";
    await helpers.notifyAdminsInApp(
      admin,
      adminIds,
      title,
      `${memberName} booked ${input.bayLabel}${coachingSuffix} on ${input.dateTimeLabel}${paidSuffix}`,
    );
    await helpers.notifyAdminsByEmail(admin, adminIds, "admin_new_booking", title, {
      member_name: memberName,
      city: input.city,
      bay: input.bayLabel,
      date: input.dateLabel,
      time: input.timeLabel,
      duration: input.duration,
      session_type: input.isCoaching ? "coaching" : "practice",
    });
    adminsNotified = true;
  } catch (e) {
    errors.push(`admin notify: ${(e as Error).message}`);
    console.error("Failed to notify admins about new booking:", (e as Error).message);
  }

  return { memberEmailSent, adminsNotified, errors };
}
