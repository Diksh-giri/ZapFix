import { maskQuotedValues } from "@/server/diagnosis/ai/payload";

/** Keys that identify a person or their calendar. Removed from anything saved as a fixture. */
const PERSONAL_KEYS = new Set([
  "creator", "organizer", "attendees", "summary", "description", "location", "htmlLink",
  "iCalUID", "hangoutLink", "conferenceData", "reminders", "extendedProperties", "start", "end",
]);

/**
 * Makes a raw Google response safe to commit: no tokens, no emails, no echoed values, and no personal
 * event fields. The personal-field filter applies only at the top level (an event), so the `location`
 * inside an error entry, which names the invalid field, is kept.
 */
export function sanitizeGoogleBody(value: unknown, accessToken: string, topLevel = true): unknown {
  if (value === undefined) return null;
  if (typeof value === "string") return maskQuotedValues(value.split(accessToken).join("[token]").replace(/Bearer\s+\S+/gi, "Bearer [token]"));
  if (Array.isArray(value)) return value.map((v) => sanitizeGoogleBody(v, accessToken, false));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !(topLevel && PERSONAL_KEYS.has(k)))
        .map(([k, v]) => [k, sanitizeGoogleBody(v, accessToken, false)]),
    );
  }
  return value;
}
