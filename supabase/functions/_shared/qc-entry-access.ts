type AuthClientFactory = (url: string, key: string) => {
  auth: {
    getUser: (token: string) => Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
};

export type QcCaller =
  | { kind: "user"; userId: string }
  | { kind: "guest" }
  | { kind: "invalid" };

export async function resolveQcCaller(
  authorization: string | null,
  supabaseUrl: string,
  anonKey: string,
  clientFactory: AuthClientFactory,
): Promise<QcCaller> {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || token === anonKey) return { kind: "guest" };

  const authClient = clientFactory(supabaseUrl, anonKey);
  const { data: { user }, error } = await authClient.auth.getUser(token);
  if (error || !user) return { kind: "invalid" };
  return { kind: "user", userId: user.id };
}

export function createGuestClaim(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashGuestClaim(claim: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(claim));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(left: string, right: string): boolean {
  const comparisonLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < comparisonLength; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export async function canAccessQcEntry(
  caller: QcCaller,
  entry: { owner_id: string | null; guest_claim_hash: string | null },
  guestClaim?: string,
): Promise<boolean> {
  if (caller.kind === "user") return entry.owner_id === caller.userId;
  if (caller.kind !== "guest" || !entry.guest_claim_hash || !guestClaim) return false;
  const suppliedHash = await hashGuestClaim(guestClaim);
  return constantTimeEqual(entry.guest_claim_hash, suppliedHash);
}