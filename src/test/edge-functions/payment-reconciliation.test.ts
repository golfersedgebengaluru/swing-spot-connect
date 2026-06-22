import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const webhookSrc = readFileSync(
  resolve(__dirname, "../../../supabase/functions/razorpay-webhook/index.ts"),
  "utf-8",
);
const reconcilerSrc = readFileSync(
  resolve(__dirname, "../../../supabase/functions/reconcile-pending-payments/index.ts"),
  "utf-8",
);
const adminTabSrc = readFileSync(
  resolve(__dirname, "../../components/admin/AdminPaymentsTab.tsx"),
  "utf-8",
);

describe("razorpay-webhook always returns 200 (prevents Razorpay auto-disable)", () => {
  it("does NOT return 4xx/5xx on missing signature", () => {
    // Razorpay auto-disables webhooks after repeated non-2xx responses.
    // Misconfig errors must be surfaced in logs, not via HTTP status.
    expect(webhookSrc).toMatch(/Missing signature[\s\S]{0,200}status:\s*200/);
  });
  it("does NOT return 4xx/5xx on invalid signature", () => {
    expect(webhookSrc).toMatch(/Invalid signature[\s\S]{0,200}status:\s*200/);
  });
  it("does NOT return 4xx/5xx when webhook secret is missing", () => {
    expect(webhookSrc).toMatch(/Webhook secret not configured[\s\S]{0,200}status:\s*200/);
  });
  it("logs secret_source for traceability", () => {
    expect(webhookSrc).toMatch(/secret_source=/);
  });
});

describe("razorpay-webhook signature & reconciliation wiring", () => {
  it("rejects requests without x-razorpay-signature", () => {
    expect(webhookSrc).toMatch(/x-razorpay-signature/);
    expect(webhookSrc).toMatch(/Missing signature/);
  });

  it("verifies HMAC-SHA256 using the per-city webhook_secret", () => {
    expect(webhookSrc).toMatch(/payment_gateways[\s\S]{0,400}webhook_secret/);
    expect(webhookSrc).toMatch(/HMAC.*SHA-256|SHA-256.*HMAC/);
  });

  it("uses constant-time comparison for the signature", () => {
    expect(webhookSrc).toMatch(/diff \|= computedSignature\.charCodeAt/);
  });

  it("is idempotent on payment_events.razorpay_event_id", () => {
    expect(webhookSrc).toMatch(/payment_events[\s\S]{0,200}razorpay_event_id/);
    expect(webhookSrc).toMatch(/already_processed/);
  });

  it("reconciles all three pending tables on payment.captured", () => {
    expect(webhookSrc).toMatch(/pending_guest_bookings/);
    expect(webhookSrc).toMatch(/pending_purchases/);
    expect(webhookSrc).toMatch(/pending_legacy_league_team_registrations/);
  });

  it("invokes calendar-sync with action=guest_booking when reconciling a guest booking", () => {
    expect(webhookSrc).toMatch(/calendar-sync[\s\S]{0,400}guest_booking/);
  });

  it("handles order.paid identically to payment.captured (Razorpay sends this on retry success)", () => {
    expect(webhookSrc).toMatch(/order\.paid/);
    expect(webhookSrc).toMatch(/isSuccess[\s\S]{0,200}payment\.captured[\s\S]{0,200}order\.paid|payment\.captured[\s\S]{0,200}order\.paid[\s\S]{0,200}isSuccess/);
  });

  it("does NOT mark pending_* rows failed on payment.failed (retries on same order must still finalize)", () => {
    // The cron reconciler is the only thing that may flip pending_* → failed, and
    // only after re-checking the live Razorpay order status.
    expect(webhookSrc).not.toMatch(/payment\.failed[\s\S]{0,2000}pending_guest_bookings[\s\S]{0,200}status:\s*"failed"/);
    expect(webhookSrc).toMatch(/payment\.failed[\s\S]+leaving pending_\* rows untouched/);
  });
});

describe("reconcile-pending-payments cron job", () => {
  it("queries Razorpay Orders API for pending bookings", () => {
    expect(reconcilerSrc).toMatch(/api\.razorpay\.com\/v1\/orders\//);
  });

  it("only processes rows older than a small grace period (avoids racing the browser)", () => {
    expect(reconcilerSrc).toMatch(/RECONCILE_AGE_MIN/);
  });

  it("ignores rows older than the 24h backstop", () => {
    expect(reconcilerSrc).toMatch(/MAX_AGE_HOURS\s*=\s*24/);
  });

  it("finalizes guest bookings by invoking calendar-sync with order_id and payment_id", () => {
    expect(reconcilerSrc).toMatch(/calendar-sync[\s\S]+order_id/);
    expect(reconcilerSrc).toMatch(/action:\s*"guest_booking"/);
  });

  it("finalizes hour purchases via complete_hour_purchase RPC", () => {
    expect(reconcilerSrc).toMatch(/complete_hour_purchase/);
  });

  it("finalizes legacy team registration on captured payment (via shared resolver)", () => {
    // The naked insert was moved into resolveOrCreateLegacyRegistration so all
    // three finalizers (browser/webhook/cron) share the same race-safe path.
    expect(reconcilerSrc).toMatch(/resolveOrCreateLegacyRegistration\(/);
  });

  it("marks long-pending rows whose Razorpay status is not paid as failed", () => {
    expect(reconcilerSrc).toMatch(/Razorpay order status=/);
    expect(reconcilerSrc).toMatch(/status:\s*"failed"/);
  });

  it("returns a structured summary so cron logs are auditable", () => {
    expect(reconcilerSrc).toMatch(/checked/);
    expect(reconcilerSrc).toMatch(/finalized/);
    expect(reconcilerSrc).toMatch(/still_pending/);
  });
});

describe("AdminPaymentsTab webhook_secret field", () => {
  it("Gateway interface includes webhook_secret", () => {
    expect(adminTabSrc).toMatch(/webhook_secret:\s*string\s*\|\s*null/);
  });

  it("renders the Webhook Secret input only for razorpay gateways", () => {
    expect(adminTabSrc).toMatch(/gw\.name === "razorpay"[\s\S]+Webhook Secret/);
  });

  it("shows the webhook URL admins should paste into Razorpay dashboard", () => {
    expect(adminTabSrc).toMatch(/razorpay-webhook/);
    expect(adminTabSrc).toMatch(/payment\.captured/);
    expect(adminTabSrc).toMatch(/payment\.failed/);
  });
});

describe("browser is no longer load-bearing for payment finalization", () => {
  const publicBookingSrc = readFileSync(
    resolve(__dirname, "../../pages/PublicBooking.tsx"),
    "utf-8",
  );
  const dashboardSrc = readFileSync(
    resolve(__dirname, "../../pages/Dashboard.tsx"),
    "utf-8",
  );
  const pollerSrc = readFileSync(
    resolve(__dirname, "../../hooks/usePaymentFinalization.ts"),
    "utf-8",
  );

  it("guest checkout no longer calls calendar-sync from the Razorpay handler", () => {
    // The browser handler must not invoke calendar-sync; the webhook owns finalization.
    expect(publicBookingSrc).not.toMatch(/invoke\("calendar-sync",\s*\{\s*body:\s*\{\s*action:\s*"guest_booking"/);
    expect(publicBookingSrc).toMatch(/waitForPaymentFinalization\(\s*"pending_guest_bookings"/);
  });

  it("hour purchase no longer calls confirm-hour-purchase from the Razorpay handler", () => {
    expect(dashboardSrc).not.toMatch(/invoke\("confirm-hour-purchase"/);
    expect(dashboardSrc).toMatch(/waitForPaymentFinalization\(\s*"pending_purchases"/);
  });

  it("poller resolves on status='completed', surfaces 'failed', returns 'timeout' otherwise", () => {
    expect(pollerSrc).toMatch(/status === "completed"/);
    expect(pollerSrc).toMatch(/status === "failed"/);
    expect(pollerSrc).toMatch(/return \{ status: "timeout" \}/);
  });

  it("poller queries one of the three pending_* tables by razorpay_order_id", () => {
    expect(pollerSrc).toMatch(/pending_guest_bookings/);
    expect(pollerSrc).toMatch(/pending_purchases/);
    expect(pollerSrc).toMatch(/pending_legacy_league_team_registrations/);
    expect(pollerSrc).toMatch(/eq\("razorpay_order_id"/);
  });
});

describe("webhook idempotency across browser/webhook/cron race", () => {
  it("webhook finalizes any pending_* row not already completed (recovers from prior failed/webhook_error)", () => {
    // Uses RECOVERABLE_STATUSES (= pending/failed/webhook_error/error/signature_failed)
    // so a successful retry on the same order_id still gets finalized.
    expect(webhookSrc).toMatch(/RECOVERABLE_STATUSES\s*=\s*\[[^\]]*"pending"[^\]]*"failed"[^\]]*"webhook_error"/);
    expect(webhookSrc).toMatch(/pending_guest_bookings[\s\S]{0,300}\.in\("status",\s*RECOVERABLE_STATUSES\)/);
    expect(webhookSrc).toMatch(/pending_purchases[\s\S]{0,300}\.in\("status",\s*RECOVERABLE_STATUSES\)/);
    expect(webhookSrc).toMatch(/pending_legacy_league_team_registrations[\s\S]{0,300}\.in\("status",\s*RECOVERABLE_STATUSES\)/);
  });

  it("cron reconciler also uses RECOVERABLE_STATUSES (matches webhook gate)", () => {
    expect(reconcilerSrc).toMatch(/RECOVERABLE_STATUSES/);
    expect(reconcilerSrc).toMatch(/\.in\("status",\s*RECOVERABLE_STATUSES\)/);
  });
});


// ── Race-safe legacy team finalization (added 2026-06-22) ──────────
import { readFileSync as _rf } from "node:fs";
import { resolve as _rs } from "node:path";
const finalizeSrc = _rf(
  _rs(__dirname, "../../../supabase/functions/_shared/legacy-league-finalize.ts"),
  "utf-8",
);
const leagueServiceSrc = _rf(
  _rs(__dirname, "../../../supabase/functions/league-service/index.ts"),
  "utf-8",
);

describe("legacy team finalize is race-safe across browser/webhook/cron", () => {
  it("exports resolveOrCreateLegacyRegistration helper", () => {
    expect(finalizeSrc).toMatch(/export async function resolveOrCreateLegacyRegistration/);
  });
  it("looks up by razorpay_order_id BEFORE inserting (skip-if-exists)", () => {
    expect(finalizeSrc).toMatch(/eq\("razorpay_order_id", razorpayOrderId\)[\s\S]{0,200}maybeSingle/);
  });
  it("on 23505 falls back to lookup by (league_id, captain_user_id)", () => {
    expect(finalizeSrc).toMatch(/23505[\s\S]{0,1500}eq\("league_id"[\s\S]{0,200}eq\("captain_user_id"/);
  });
  it("backfills order_id/payment_id onto the winner row when missing", () => {
    expect(finalizeSrc).toMatch(/byCaptain\.razorpay_order_id \?\? razorpayOrderId/);
  });

  it("razorpay-webhook uses resolveOrCreateLegacyRegistration (no naked insert)", () => {
    expect(webhookSrc).toMatch(/resolveOrCreateLegacyRegistration\(/);
    // The old naked insert into legacy_league_team_registrations must be gone
    // from the webhook (kept only in the shared resolver).
    expect(webhookSrc).not.toMatch(/\.from\("legacy_league_team_registrations"\)\s*\.insert/);
  });
  it("razorpay-webhook ALWAYS marks pending → completed (even when another finalizer beat it)", () => {
    expect(webhookSrc).toMatch(/status: "completed"[\s\S]{0,200}registration_id: resolved\.reg\.id/);
  });
  it("razorpay-webhook always calls finalizeLegacyTeamRegistration after resolve", () => {
    expect(webhookSrc).toMatch(/resolveOrCreateLegacyRegistration[\s\S]{0,2000}finalizeLegacyTeamRegistration/);
  });
  it("razorpay-webhook wraps payment_events processed=true in try/catch (always-mark)", () => {
    expect(webhookSrc).toMatch(/try\s*{[\s\S]{0,200}payment_events[\s\S]{0,200}processed: true[\s\S]{0,200}}\s*catch/);
  });

  it("reconcile-pending-payments uses resolveOrCreateLegacyRegistration", () => {
    expect(reconcilerSrc).toMatch(/resolveOrCreateLegacyRegistration\(/);
    expect(reconcilerSrc).not.toMatch(/\.from\("legacy_league_team_registrations"\)\s*\.insert/);
  });

  it("league-service verify-team-payment uses resolveOrCreateLegacyRegistration", () => {
    expect(leagueServiceSrc).toMatch(/resolveOrCreateLegacyRegistration\(/);
  });
  it("league-service uses shared finalizeLegacyTeamRegistration (no duplicate inline path)", () => {
    expect(leagueServiceSrc).toMatch(/finalizeLegacyTeamRegistration\(/);
  });
  it("league-service ALWAYS marks pending → completed with resolved registration id", () => {
    expect(leagueServiceSrc).toMatch(/status: 'completed', registration_id: reg\.id/);
  });
  it("league-service only records coupon redemption when it was the inserter", () => {
    expect(leagueServiceSrc).toMatch(/resolved\.created &&[\s\S]{0,400}coupon_redemptions/);
  });
});
