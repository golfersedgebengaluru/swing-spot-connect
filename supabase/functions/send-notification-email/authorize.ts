// Who may ask the app to send which email. Backend functions (service credential)
// may send any template, including guest and password emails to explicit addresses.
// Browser callers may only email existing members through the profile on file.

export const MEMBER_SELF_TEMPLATES = new Set(["points_earned", "points_redeemed"]);
export const COACH_TEMPLATES = new Set(["coaching_session_added"]);

export interface EmailAuthInput {
  isService: boolean;
  callerId: string | null;
  isStaff: boolean;
  template: string;
  hasRecipientEmail: boolean;
  hasUserId: boolean;
  isTest: boolean;
  targetIsSelf: boolean;
  callerCoachesTarget: boolean;
}

export function authorizeEmailRequest(i: EmailAuthInput): { ok: true } | { ok: false; error: string } {
  if (i.isService) return { ok: true };
  if (!i.callerId) return { ok: false, error: "Unauthorized" };
  if (i.hasRecipientEmail) return { ok: false, error: "Recipient address not allowed" };
  if (!i.hasUserId) return { ok: false, error: "Missing recipient" };
  if (i.isStaff) return { ok: true };
  if (i.isTest) return { ok: false, error: "Forbidden" };
  if (MEMBER_SELF_TEMPLATES.has(i.template) && i.targetIsSelf) return { ok: true };
  if (COACH_TEMPLATES.has(i.template) && i.callerCoachesTarget) return { ok: true };
  return { ok: false, error: "Forbidden" };
}

/** Caller-supplied subjects are single-line and bounded. */
export function sanitizeSubject(subject: string): string {
  return subject.replace(/[\r\n]+/g, " ").trim().slice(0, 150);
}
