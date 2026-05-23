import DOMPurify from "dompurify";

/**
 * Sanitize admin-authored HTML before rendering with dangerouslySetInnerHTML.
 * Strips <script>, on* event handlers, javascript: URLs, etc. while preserving
 * common formatting tags used in the rich text editor.
 */
export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return "";
  return DOMPurify.sanitize(dirty, { USE_PROFILES: { html: true } });
}
