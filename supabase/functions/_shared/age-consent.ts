export interface AgeConsentClient {
  rpc(
    fn: "member_age_consent_allows_writes",
    args: { _user_id: string },
  ): PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
}

/** Fail closed: an unavailable consent status never enables a member write. */
export async function memberAgeConsentAllowed(client: AgeConsentClient, userId: string): Promise<boolean> {
  const { data, error } = await client.rpc("member_age_consent_allows_writes", { _user_id: userId });
  return !error && data === true;
}
