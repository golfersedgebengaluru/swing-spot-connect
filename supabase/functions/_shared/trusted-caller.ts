// Identifies calls made by other backend functions with the service credential.
export function isServiceRoleToken(authHeader: string | null | undefined, serviceKey: string | undefined): boolean {
  if (!serviceKey || !authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7).trim();
  if (token.length !== serviceKey.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ serviceKey.charCodeAt(i);
  return diff === 0;
}
