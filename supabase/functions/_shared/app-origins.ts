// Origins that belong to this app. Links we put in emails (password reset and
// similar) may only point here, never at a caller-chosen site. Pure module —
// no Deno APIs — so it can be unit-tested from Vitest.

export const PRIMARY_APP_ORIGIN = "https://golfersedge.golf-collective.com";

const PROJECT_ID = "373df412-22ca-43b5-8530-7e1b41956793";

const EXACT_ORIGINS = new Set<string>([
  PRIMARY_APP_ORIGIN,
  "https://swing-spot-connect.lovable.app",
]);

const PROJECT_HOST = new RegExp(
  `^(?:id-preview--)?${PROJECT_ID}\\.(?:lovable\\.app|lovableproject\\.com)$`,
);

export function isAllowedAppOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  return EXACT_ORIGINS.has(url.origin) || PROJECT_HOST.test(url.hostname);
}

/**
 * Returns `<origin><path>` when the candidate URL is on one of our origins and
 * targets exactly `path`; otherwise the primary site with that path.
 * Query strings and fragments from the caller are dropped.
 */
export function safeAppRedirect(candidate: unknown, path: string): string {
  if (typeof candidate === "string" && candidate.length < 500) {
    try {
      const url = new URL(candidate);
      if (isAllowedAppOrigin(url.origin) && url.pathname === path) return `${url.origin}${path}`;
    } catch {
      // fall through to the default
    }
  }
  return `${PRIMARY_APP_ORIGIN}${path}`;
}
