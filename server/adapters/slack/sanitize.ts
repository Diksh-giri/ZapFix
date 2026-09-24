import { maskQuotedValues } from "@/server/diagnosis/ai/payload";

/** What we keep of a Slack response. The message object, user, team and bot ids are personal or workspace data. */
const KEEP = new Set(["ok", "error", "warning", "needed", "provided", "channel", "ts"]);

export function sanitizeSlackBody(value: unknown, accessToken: string): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([k]) => KEEP.has(k))
      .map(([k, v]) => [
        k,
        typeof v === "string"
          ? maskQuotedValues((accessToken ? v.split(accessToken).join("[token]") : v).replace(/xox[a-z]-[\w-]+/gi, "[token]"))
          : v,
      ]),
  );
}
