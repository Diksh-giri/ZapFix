import { createHash } from "node:crypto";
import type { StandardError } from "@/lib/schemas/standard-error";
import { baseGoogleError, describeGoogleError, googleRequest, type GoogleErrorBody } from "../google-http";
import type { AppAdapter, ExecuteContext, ExecuteResult } from "../types";
import { missingRequiredMappings } from "../types";

/**
 * Google Calendar adapter: creates one event on the tester's primary calendar (needs the
 * calendar.events.owned scope). The three PRD failure types come from Google itself, so values are
 * sent as they are: an empty attendee or a date like 03/15/2026 must reach Google to produce its real error.
 *
 * Duplicate protection (checked against Google's docs): events.insert accepts a client-supplied event id
 * (lowercase base32hex, 5 to 1024 characters, unique per calendar; a repeat returns 409 duplicate). The id is
 * derived from run + step, NOT the attempt number, so a retry after an uncertain outcome cannot create a second event.
 *
 * The 400 mapping is grounded in real recorded responses (tests/fixtures/google-calendar/): an empty attendee
 * gives "Invalid attendee email." and a bad date gives "Bad Request" with no field, so the field is found from the request.
 */
const ENDPOINT = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const B32HEX = "0123456789abcdefghijklmnopqrstuv";

export function eventIdFor(idempotencyKey: string): string {
  const base = idempotencyKey.replace(/:\d+$/, ""); // drop the attempt number
  const bytes = createHash("sha256").update(base).digest().subarray(0, 20);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32HEX[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Google answers a badly formatted date with 400 "Bad Request" and names no field (recorded fixture).
 * The request itself tells us: if exactly one date field is not RFC 3339, that is the field.
 */
function badDatetimeField(values: Record<string, string>): string | undefined {
  const bad = ["start", "end"].filter((k) => (values[k] ?? "") !== "" && !RFC3339.test(values[k] ?? ""));
  return bad.length === 1 ? bad[0] : undefined;
}

const FIELD_HINTS: Array<[RegExp, string]> = [
  [/attendee/i, "attendee_email"],
  [/\bstart\b/i, "start"],
  [/\bend\b/i, "end"],
  [/\b(summary|title)\b/i, "title"],
];

const fail = (requestSummary: Record<string, string>, error: StandardError): ExecuteResult => ({
  ok: false,
  requestSummary,
  error,
});

function fieldFrom(location: string | undefined, message: string): string | undefined {
  for (const text of [location ?? "", message]) {
    const hit = FIELD_HINTS.find(([re]) => re.test(text));
    if (hit) return hit[1];
  }
  return undefined;
}

function mapHttpError(
  status: number,
  body: GoogleErrorBody | undefined,
  accessToken: string,
  values: Record<string, string>,
): StandardError {
  const info = describeGoogleError(status, body, accessToken);
  const known = baseGoogleError(info);
  if (known) return known;

  // 400: the meaning is specific to Calendar.
  const field = fieldFrom(info.location, info.rawMessage) ?? badDatetimeField(values);
  // Google says "Invalid attendee email" for an empty attendee (recorded fixture). A field it rejected
  // that we sent empty is a missing field.
  const missing =
    info.reason === "required" ||
    /\b(required|missing|empty|blank)\b/i.test(info.rawMessage) ||
    (field !== undefined && (values[field] ?? "") === "");
  return {
    code: info.code,
    message: info.message,
    retryable: false,
    outcome: "not_executed",
    category_hint: missing ? "missing_field" : "invalid_value",
    ...(field ? { field } : {}),
  };
}

export function createGoogleCalendarAdapter(fetchFn: typeof fetch = fetch): AppAdapter {
  return {
    id: "google_calendar",
    provider: "google",
    actions: [
      {
        key: "create_event",
        label: "Create event",
        fields: [
          { key: "title", label: "Title", required: true, type: "text" },
          { key: "start", label: "Start", required: true, type: "datetime_rfc3339" },
          { key: "end", label: "End", required: true, type: "datetime_rfc3339" },
          { key: "attendee_email", label: "Attendee email", required: true, type: "email" },
        ],
      },
    ],

    validateConfig(actionKey, config) {
      const action = this.actions.find((a) => a.key === actionKey);
      return action ? missingRequiredMappings(action, config) : [`Unknown action "${actionKey}"`];
    },

    async execute(actionKey, values, ctx: ExecuteContext): Promise<ExecuteResult> {
      const action = this.actions.find((a) => a.key === actionKey);
      const summary = Object.fromEntries(
        (action?.fields ?? []).map((f) => [f.key, (values[f.key] ?? "") === "" ? "empty" : "provided"]),
      );
      if (!action) {
        return fail(summary, {
          category_hint: "unknown", code: "unknown_action", message: "Unknown action",
          retryable: false, outcome: "not_executed",
        });
      }

      const id = eventIdFor(ctx.idempotencyKey);
      const sent = await googleRequest(
        fetchFn,
        `${ENDPOINT}?sendUpdates=none`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${ctx.accessToken}`, "content-type": "application/json" },
          body: JSON.stringify({
            id,
            summary: values.title ?? "",
            start: { dateTime: values.start ?? "" },
            end: { dateTime: values.end ?? "" },
            attendees: [{ email: values.attendee_email ?? "" }],
          }),
        },
        ctx.timeoutMs,
        "Google Calendar",
      );
      if (!sent.ok) return fail(summary, sent.error);

      const { res } = sent;
      const body = sent.body as (GoogleErrorBody & { id?: string }) | undefined;
      if (res.ok) {
        if (typeof body?.id === "string" && body.id) return { ok: true, externalRef: body.id, requestSummary: summary };
        return fail(summary, {
          category_hint: "unknown", code: "bad_response", message: "Google answered without an event id.",
          retryable: true, outcome: "uncertain",
        });
      }
      // 409 duplicate: an earlier attempt already created this exact event.
      if (res.status === 409 && body?.error?.errors?.[0]?.reason === "duplicate") {
        return { ok: true, externalRef: id, requestSummary: summary };
      }
      return fail(summary, mapHttpError(res.status, body, ctx.accessToken, values));
    },
  };
}

export const googleCalendarAdapter: AppAdapter = createGoogleCalendarAdapter();
