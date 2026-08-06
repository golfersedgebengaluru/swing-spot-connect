import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  sendBookingConfirmedNotifications,
  type BookingNotificationHelpers,
} from "../../../supabase/functions/_shared/booking-notifications";

function makeHelpers(overrides: Partial<BookingNotificationHelpers> = {}) {
  const sendEmail = vi.fn().mockResolvedValue(undefined);
  const helpers: BookingNotificationHelpers = {
    sendEmail,
    resolveDisplayName: vi.fn().mockResolvedValue("Veena V"),
    getAdminIds: vi.fn().mockResolvedValue(["admin-1", "admin-2"]),
    notifyAdminsInApp: vi.fn().mockResolvedValue(undefined),
    notifyAdminsByEmail: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return helpers;
}

const baseInput = {
  userId: "user-1",
  city: "Bengaluru",
  bayLabel: "Bay 1",
  isCoaching: false,
  dateLabel: "Friday, 7 August 2026",
  timeLabel: "08:00 – 09:00",
  dateTimeLabel: "7/8/2026, 8:00:00 am",
  duration: "1h",
  hoursRemaining: "N/A (paid via gateway)",
  addToCalendarUrl: "https://example.com/x.ics",
  memberNameFallback: "A member",
};

describe("sendBookingConfirmedNotifications", () => {
  it("sends the member booking_confirmed email with all template data", async () => {
    const helpers = makeHelpers();
    const res = await sendBookingConfirmedNotifications({}, baseInput, helpers);

    expect(res.memberEmailSent).toBe(true);
    expect(helpers.sendEmail).toHaveBeenCalledTimes(1);
    const payload = (helpers.sendEmail as any).mock.calls[0][0];
    expect(payload.template).toBe("booking_confirmed");
    expect(payload.user_id).toBe("user-1");
    expect(payload.data).toMatchObject({
      city: "Bengaluru",
      bay: "Bay 1",
      date: "Friday, 7 August 2026",
      time: "08:00 – 09:00",
      duration: "1h",
      add_to_calendar_url: "https://example.com/x.ics",
    });
  });

  it("notifies admins in-app and by email, excluding the booking member", async () => {
    const helpers = makeHelpers();
    await sendBookingConfirmedNotifications({}, baseInput, helpers);

    expect(helpers.getAdminIds).toHaveBeenCalledWith({}, "Bengaluru", "user-1");
    expect(helpers.notifyAdminsInApp).toHaveBeenCalledTimes(1);
    expect(helpers.notifyAdminsByEmail).toHaveBeenCalledWith(
      {},
      ["admin-1", "admin-2"],
      "admin_new_booking",
      expect.any(String),
      expect.objectContaining({ member_name: "Veena V", session_type: "practice" }),
    );
  });

  it("labels paid bookings and includes the payment method in the in-app message", async () => {
    const helpers = makeHelpers();
    await sendBookingConfirmedNotifications(
      {},
      { ...baseInput, paymentMethod: "razorpay" },
      helpers,
    );
    const [, , title, message] = (helpers.notifyAdminsInApp as any).mock.calls[0];
    expect(title).toBe("📅 New Booking (Paid)");
    expect(message).toContain("paid via razorpay");
  });

  it("uses the unpaid title for hours-based bookings", async () => {
    const helpers = makeHelpers();
    await sendBookingConfirmedNotifications({}, baseInput, helpers);
    const [, , title] = (helpers.notifyAdminsInApp as any).mock.calls[0];
    expect(title).toBe("📅 New Booking");
  });

  it("marks coaching sessions in the admin payload", async () => {
    const helpers = makeHelpers();
    await sendBookingConfirmedNotifications({}, { ...baseInput, isCoaching: true }, helpers);
    const data = (helpers.notifyAdminsByEmail as any).mock.calls[0][4];
    expect(data.session_type).toBe("coaching");
  });

  it("still notifies admins when the member email fails", async () => {
    const helpers = makeHelpers({
      sendEmail: vi.fn().mockRejectedValue(new Error("smtp down")),
    });
    const res = await sendBookingConfirmedNotifications({}, baseInput, helpers);
    expect(res.memberEmailSent).toBe(false);
    expect(res.adminsNotified).toBe(true);
    expect(res.errors[0]).toContain("smtp down");
  });

  it("never throws when admin notification fails", async () => {
    const helpers = makeHelpers({
      getAdminIds: vi.fn().mockRejectedValue(new Error("db down")),
    });
    const res = await sendBookingConfirmedNotifications({}, baseInput, helpers);
    expect(res.memberEmailSent).toBe(true);
    expect(res.adminsNotified).toBe(false);
  });
});

describe("calendar-sync booking paths use the shared notifier", () => {
  const src = readFileSync(
    resolve(__dirname, "../../../supabase/functions/calendar-sync/index.ts"),
    "utf8",
  );

  it("calls sendBookingConfirmedNotifications from all three confirmed-booking paths", () => {
    const calls = src.match(/sendBookingConfirmedNotifications\(/g) ?? [];
    // 1 import + 3 call sites
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });

  it("notifies from the webhook recovery path (finalize_pending_member_booking)", () => {
    const start = src.indexOf('action === "finalize_pending_member_booking"');
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, src.indexOf("// All other actions require authentication"));
    expect(block).toContain("sendBookingConfirmedNotifications(");
  });

  it("no longer inlines a booking_confirmed email fetch", () => {
    expect(src).not.toContain('template: "booking_confirmed"');
  });
});
