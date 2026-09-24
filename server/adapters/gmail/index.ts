import type { StandardError } from "@/lib/schemas/standard-error";
import { baseGoogleError, describeGoogleError, googleRequest, type GoogleErrorBody } from "../google-http";
import type { AppAdapter, ExecuteContext, ExecuteResult } from "../types";
import { missingRequiredMappings } from "../types";

/**
 * Gmail adapter: sends one plain-text email from the tester's own account with users.messages.send
 * (needs the gmail.send scope, which cannot read mail). Use test accounts only.
 *
 * Duplicate protection: Gmail has none for messages.send (checked against its docs: no client message id or
 * idempotency key), so we rely on the one-success-per-step rule and the uncertain-outcome rule: a timeout or
 * dropped connection is "uncertain" and a retry then needs explicit confirmation.
 *
 * Values are sent as they are so Gmail's real errors get recorded, EXCEPT a line break in the recipient or subject,
 * which would let a value inject extra headers (for example a hidden Bcc). That is refused before anything is sent.
 * TODO(T11): confirm Gmail's real 400 responses for an empty or invalid recipient against recorded fixtures.
 */
const ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

const fail = (requestSummary: Record<string, string>, error: StandardError): ExecuteResult => ({
  ok: false,
  requestSummary,
  error,
});

const b64Lines = (text: string) => (Buffer.from(text, "utf8").toString("base64").match(/.{1,76}/g) ?? []).join("\r\n");

function buildRawMessage(values: Record<string, string>): string {
  const subject = values.subject ?? "";
  const encodedSubject = /^[\x20-\x7e]*$/.test(subject) ? subject : `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
  const message = [
    `To: ${values.to ?? ""}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64Lines(values.body ?? ""),
  ].join("\r\n");
  return Buffer.from(message, "utf8").toString("base64url");
}

function fieldFrom(location: string | undefined, message: string): string | undefined {
  const hints: Array<[RegExp, string]> = [
    [/\bto header\b|\brecipient|\bto:/i, "to"],
    [/\bsubject\b/i, "subject"],
    [/\bbody\b/i, "body"],
  ];
  for (const text of [location ?? "", message]) {
    const hit = hints.find(([re]) => re.test(text));
    if (hit) return hit[1];
  }
  return undefined;
}

function mapHttpError(status: number, body: GoogleErrorBody | undefined, accessToken: string, values: Record<string, string>): StandardError {
  const info = describeGoogleError(status, body, accessToken);
  const known = baseGoogleError(info);
  if (known) return known;

  const field = fieldFrom(info.location, info.rawMessage);
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

export function createGmailAdapter(fetchFn: typeof fetch = fetch): AppAdapter {
  return {
    id: "gmail",
    provider: "google",
    actions: [
      {
        key: "send_email",
        label: "Send email",
        fields: [
          { key: "to", label: "To", required: true, type: "email" },
          { key: "subject", label: "Subject", required: true, type: "text" },
          { key: "body", label: "Message", required: true, type: "text" },
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

      for (const field of ["to", "subject"]) {
        if (/[\r\n\u0000]/.test(values[field] ?? "")) {
          return fail(summary, {
            category_hint: "invalid_value", code: "invalid_header_value", field,
            message: "The value contains a line break, which is not allowed in an email header.",
            retryable: false, outcome: "not_executed",
          });
        }
      }

      const sent = await googleRequest(
        fetchFn,
        ENDPOINT,
        {
          method: "POST",
          headers: { authorization: `Bearer ${ctx.accessToken}`, "content-type": "application/json" },
          body: JSON.stringify({ raw: buildRawMessage(values) }),
        },
        ctx.timeoutMs,
        "Gmail",
      );
      if (!sent.ok) return fail(summary, sent.error);

      const body = sent.body as (GoogleErrorBody & { id?: string }) | undefined;
      if (sent.res.ok) {
        if (typeof body?.id === "string" && body.id) return { ok: true, externalRef: body.id, requestSummary: summary };
        return fail(summary, {
          category_hint: "unknown", code: "bad_response", message: "Gmail answered without a message id.",
          retryable: true, outcome: "uncertain",
        });
      }
      return fail(summary, mapHttpError(sent.res.status, body, ctx.accessToken, values));
    },
  };
}

export const gmailAdapter: AppAdapter = createGmailAdapter();
