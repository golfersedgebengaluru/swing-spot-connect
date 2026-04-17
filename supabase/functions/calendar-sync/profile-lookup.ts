/**
 * Resolve a profile's display_name when the booking's `user_id` may be either
 * a real `auth.users.id` (which equals `profiles.user_id`) OR a `profiles.id`
 * for members who don't have an auth account (admin-created profile-only members).
 *
 * The bug this fixes: coaching approvals overwrote the calendar event title to
 * "Member" because the lookup only matched `profiles.user_id`, but profile-only
 * members have `user_id = NULL` and their booking stores `profiles.id` in
 * `bookings.user_id` instead.
 *
 * Always do a dual-key lookup: try `user_id` first, then fall back to `id`.
 */
export async function resolveProfileDisplayName(
  adminClient: any,
  bookingUserId: string | null | undefined,
  fallback: string = "Member"
): Promise<string> {
  if (!bookingUserId) return fallback;

  // Try matching by profiles.user_id (auth-account members).
  const { data: byUserId } = await adminClient
    .from("profiles")
    .select("display_name")
    .eq("user_id", bookingUserId)
    .maybeSingle();
  if (byUserId?.display_name) return byUserId.display_name;

  // Fallback: profile-only members store their profiles.id in bookings.user_id.
  const { data: byId } = await adminClient
    .from("profiles")
    .select("display_name")
    .eq("id", bookingUserId)
    .maybeSingle();
  if (byId?.display_name) return byId.display_name;

  return fallback;
}
