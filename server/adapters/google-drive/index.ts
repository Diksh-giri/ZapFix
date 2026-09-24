import { randomBytes } from "node:crypto";
import type { StandardError } from "@/lib/schemas/standard-error";
import { baseGoogleError, describeGoogleError, googleRequest, type GoogleErrorBody } from "../google-http";
import type { AppAdapter, ExecuteContext, ExecuteResult } from "../types";
import { missingRequiredMappings } from "../types";

/**
 * Google Drive adapter: creates one plain-text file in the tester's Drive with files.create (multipart upload;
 * needs the drive.file scope, which only reaches files the app creates or is given).
 *
 * Duplicate protection: none we can derive. Drive accepts client-supplied file ids only from a separate
 * files.generateIds call, which returns a fresh id every time, so it cannot make a retry idempotent. We rely on the
 * one-success-per-step rule and the uncertain-outcome rule: a timeout or dropped connection is "uncertain" and a retry
 * then needs explicit confirmation.
 *
 * Values are sent as they are so Drive's real behavior gets recorded.
 * TODO(T11): confirm Drive's real responses (for example an empty name) against recorded fixtures.
 */
const ENDPOINT = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id";

const fail = (requestSummary: Record<string, string>, error: StandardError): ExecuteResult => ({
  ok: false,
  requestSummary,
  error,
});

function fieldFrom(location: string | undefined, message: string): string | undefined {
  for (const text of [location ?? "", message]) {
    if (/\bname\b|\btitle\b/i.test(text)) return "name";
    if (/\bcontent\b/i.test(text)) return "content";
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

export function createGoogleDriveAdapter(fetchFn: typeof fetch = fetch): AppAdapter {
  return {
    id: "google_drive",
    provider: "google",
    actions: [
      {
        key: "create_file",
        label: "Create file",
        fields: [
          { key: "name", label: "File name", required: true, type: "text" },
          { key: "content", label: "Content", required: false, type: "text" },
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

      const boundary = `zapfix-${randomBytes(16).toString("hex")}`;
      const body = [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        JSON.stringify({ name: values.name ?? "", mimeType: "text/plain" }),
        `--${boundary}`,
        "Content-Type: text/plain; charset=UTF-8",
        "",
        values.content ?? "",
        `--${boundary}--`,
      ].join("\r\n");

      const sent = await googleRequest(
        fetchFn,
        ENDPOINT,
        {
          method: "POST",
          headers: { authorization: `Bearer ${ctx.accessToken}`, "content-type": `multipart/related; boundary=${boundary}` },
          body,
        },
        ctx.timeoutMs,
        "Google Drive",
      );
      if (!sent.ok) return fail(summary, sent.error);

      const parsed = sent.body as (GoogleErrorBody & { id?: string }) | undefined;
      if (sent.res.ok) {
        if (typeof parsed?.id === "string" && parsed.id) return { ok: true, externalRef: parsed.id, requestSummary: summary };
        return fail(summary, {
          category_hint: "unknown", code: "bad_response", message: "Google Drive answered without a file id.",
          retryable: true, outcome: "uncertain",
        });
      }
      return fail(summary, mapHttpError(sent.res.status, parsed, ctx.accessToken, values));
    },
  };
}

export const googleDriveAdapter: AppAdapter = createGoogleDriveAdapter();
