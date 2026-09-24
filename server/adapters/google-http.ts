import type { StandardError } from "@/lib/schemas/standard-error";
import { maskQuotedValues } from "@/server/diagnosis/ai/payload";

/**
 * Shared by the Google adapters (Calendar, Gmail, Drive): one timed request, and the parts of Google's error
 * format that mean the same thing everywhere. App-specific meaning of a 400 stays in each adapter.
 * Never log tokens, request bodies or Google's raw responses.
 */
export interface GoogleErrorBody {
  error?: { message?: string; errors?: Array<{ reason?: string; message?: string; location?: string }> };
}

export interface GoogleErrorInfo {
  status: number;
  reason?: string;
  location?: string;
  /** Google's text as sent. Only for local matching, never stored. */
  rawMessage: string;
  /** Token-scrubbed and masked; safe to store. */
  message: string;
  code: string;
}

export function describeGoogleError(status: number, body: GoogleErrorBody | undefined, accessToken: string): GoogleErrorInfo {
  const first = body?.error?.errors?.[0];
  const rawMessage = first?.message ?? body?.error?.message ?? `Google answered with HTTP ${status}.`;
  const scrubbed = accessToken ? rawMessage.split(accessToken).join("[token]") : rawMessage;
  return {
    status,
    reason: first?.reason,
    location: first?.location,
    rawMessage,
    message: maskQuotedValues(scrubbed.replace(/Bearer\s+\S+/gi, "Bearer [token]")).slice(0, 500),
    code: (first?.reason ?? `http_${status}`).slice(0, 120),
  };
}

/** The mapping shared by every Google API. Returns undefined for 400, which each adapter interprets itself. */
export function baseGoogleError(info: GoogleErrorInfo): StandardError | undefined {
  const base = { code: info.code, message: info.message, retryable: false, outcome: "not_executed" as const };
  const { status, reason } = info;
  if (status === 401) return { ...base, category_hint: "auth" };
  if (status === 429 || (status === 403 && /ratelimit|dailylimit/i.test(reason ?? ""))) {
    return { ...base, category_hint: "rate_limit", retryable: true };
  }
  if (status === 403 && /quota/i.test(reason ?? "")) return { ...base, category_hint: "unknown" }; // e.g. storageQuotaExceeded
  if (status === 403) return { ...base, category_hint: "auth" };
  if (status === 404) return { ...base, category_hint: "not_found" };
  if (status >= 500) return { ...base, category_hint: "unavailable", retryable: true, outcome: "uncertain" };
  if (status === 400) return undefined;
  return { ...base, category_hint: "unknown" };
}

/** One request with a timeout. A timeout or dropped connection is "uncertain": Google may have done it. */
export async function googleRequest(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  service: string,
): Promise<{ ok: true; res: Response; body: unknown } | { ok: false; error: StandardError }> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const res = await fetchFn(url, { ...init, signal: controller.signal });
    const body: unknown = await res.json().catch(() => undefined);
    return { ok: true, res, body };
  } catch {
    return {
      ok: false,
      error: {
        category_hint: "unavailable",
        code: timedOut ? "timeout" : "network_error",
        message: timedOut ? `${service} did not answer in time.` : `The connection to ${service} was interrupted.`,
        retryable: true,
        outcome: "uncertain",
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
