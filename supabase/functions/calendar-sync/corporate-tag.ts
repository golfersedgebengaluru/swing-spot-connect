/**
 * Resolve the bracket tag used in calendar event summaries for guest bookings.
 *
 * - When the booked profile is linked to a corporate account, returns the first
 *   word of the corporate name (e.g. "Apexlynx Pvt Ltd" -> "Apexlynx").
 * - Otherwise (or on any lookup failure), returns the safe fallback "Guest".
 *
 * `profileRef` may be either a `profiles.user_id` (auth-account members) or a
 * `profiles.id` (profile-only members). We try both, mirroring the dual-key
 * pattern used in resolveProfileDisplayName.
 */
export async function resolveCorporateTag(
  adminClient: any,
  profileRef: string | null | undefined,
  fallback: string = "Guest"
): Promise<string> {
  if (!profileRef) return fallback;

  // Try by profiles.user_id first.
  let corporateAccountId: string | null = null;
  const { data: byUserId } = await adminClient
    .from("profiles")
    .select("corporate_account_id")
    .eq("user_id", profileRef)
    .maybeSingle();
  if (byUserId?.corporate_account_id) {
    corporateAccountId = byUserId.corporate_account_id;
  } else {
    const { data: byId } = await adminClient
      .from("profiles")
      .select("corporate_account_id")
      .eq("id", profileRef)
      .maybeSingle();
    if (byId?.corporate_account_id) corporateAccountId = byId.corporate_account_id;
  }

  if (!corporateAccountId) return fallback;

  const { data: corp } = await adminClient
    .from("corporate_accounts")
    .select("name, nickname")
    .eq("id", corporateAccountId)
    .maybeSingle();

  // Prefer admin-defined nickname; fall back to first word of full name.
  const nickname: string | null | undefined = corp?.nickname;
  if (nickname && nickname.trim().length > 0) {
    const cleaned = nickname.trim().replace(/[^\p{L}\p{N} _-]/gu, "");
    if (cleaned.length > 0) return cleaned;
  }
  const name: string | null | undefined = corp?.name;
  if (!name) return fallback;
  const firstWord = name.trim().split(/\s+/)[0]?.replace(/[^\p{L}\p{N}]/gu, "");
  return firstWord && firstWord.length > 0 ? firstWord : fallback;
}
