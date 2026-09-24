import type { StandardError } from "@/lib/schemas/standard-error";
import type { AppAdapter, ExecuteContext, ExecuteResult } from "../types";
import { missingRequiredMappings } from "../types";

/**
 * Slack adapter: posts one message with chat.postMessage (bot scopes chat:write and chat:write.public).
 * Slack answers HTTP 200 with { ok: false, error: "<code>" } for almost every problem; only rate limits
 * (429 + Retry-After) and server faults use other statuses.
 *
 * Duplicate protection: Slack has none for chat.postMessage (checked against its docs: no client message id
 * or idempotency key), so we rely on the one-success-per-step rule and the uncertain-outcome rule: a timeout or
 * dropped connection is "uncertain" and a retry then needs explicit confirmation.
 *
 * Values are sent to Slack as they are, so its real errors are what get recorded.
 * TODO(T25): confirm the empty-channel and empty-text responses against real fixtures
 * (scripts/record-slack-fixtures.ts) and adjust the mapping if Slack answers differently.
 */
const ENDPOINT = "https://slack.com/api/chat.postMessage";

type Category = StandardError["category_hint"];
interface Known {
  category: Category;
  message: string;
  field?: string;
  retryable?: boolean;
  uncertain?: boolean;
}

const AUTH = "The Slack connection is not valid any more. Reconnect Slack and try again.";
const KNOWN: Record<string, Known> = {
  invalid_auth: { category: "auth", message: AUTH },
  not_authed: { category: "auth", message: AUTH },
  token_revoked: { category: "auth", message: "The Slack connection was removed. Reconnect Slack and try again." },
  token_expired: { category: "auth", message: AUTH },
  account_inactive: { category: "auth", message: "The Slack account or workspace is no longer active." },
  missing_scope: { category: "auth", message: "The Slack connection is missing a permission. Reconnect Slack and allow it." },
  channel_not_found: { category: "not_found", field: "channel", message: "Slack could not find that channel." },
  is_archived: { category: "not_found", field: "channel", message: "That Slack channel is archived." },
  not_in_channel: { category: "not_found", field: "channel", message: "The app is not a member of that Slack channel." },
  msg_too_long: { category: "invalid_value", field: "text", message: "The message is too long for Slack." },
  no_text: { category: "missing_field", field: "text", message: "The message text is empty." },
  invalid_arguments: { category: "invalid_value", message: "Slack did not accept the message details." },
  ratelimited: { category: "rate_limit", retryable: true, message: "Slack is limiting how fast messages can be sent. Try again shortly." },
  rate_limited: { category: "rate_limit", retryable: true, message: "Slack is limiting how fast messages can be sent. Try again shortly." },
  internal_error: { category: "unavailable", retryable: true, uncertain: true, message: "Slack had a problem on its side." },
  fatal_error: { category: "unavailable", retryable: true, uncertain: true, message: "Slack had a problem on its side." },
  service_unavailable: { category: "unavailable", retryable: true, uncertain: true, message: "Slack is temporarily unavailable." },
  request_timeout: { category: "unavailable", retryable: true, uncertain: true, message: "Slack took too long to answer." },
};

const fail = (requestSummary: Record<string, string>, error: StandardError): ExecuteResult => ({
  ok: false,
  requestSummary,
  error,
});

function mapSlackError(rawCode: string, values: Record<string, string>): StandardError {
  const code = /^[a-z0-9_]{1,60}$/.test(rawCode) ? rawCode : "unknown_error";
  const known = KNOWN[code];
  const base = {
    code,
    message: known?.message ?? (code === "unknown_error" ? "Slack returned an error." : `Slack returned the error "${code}".`),
    retryable: known?.retryable ?? false,
    outcome: known?.uncertain ? ("uncertain" as const) : ("not_executed" as const),
  };
  let category: Category = known?.category ?? "unknown";
  let field = known?.field;

  // A value Slack rejected that we sent empty is a missing field.
  const emptyChannel = (values.channel ?? "") === "";
  const emptyText = (values.text ?? "") === "";
  if ((code === "channel_not_found" || code === "invalid_arguments") && emptyChannel) {
    category = "missing_field";
    field = "channel";
  } else if (code === "invalid_arguments" && emptyText) {
    category = "missing_field";
    field = "text";
  }
  return { ...base, category_hint: category, ...(field ? { field } : {}) };
}

export function createSlackAdapter(fetchFn: typeof fetch = fetch): AppAdapter {
  return {
    id: "slack",
    provider: "slack",
    actions: [
      {
        key: "post_message",
        label: "Post message",
        fields: [
          { key: "channel", label: "Channel", required: true, type: "text" },
          { key: "text", label: "Message", required: true, type: "text" },
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

      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, ctx.timeoutMs);

      try {
        const res = await fetchFn(ENDPOINT, {
          method: "POST",
          headers: { authorization: `Bearer ${ctx.accessToken}`, "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({ channel: values.channel ?? "", text: values.text ?? "" }),
          signal: controller.signal,
        });
        const body = (await res.json().catch(() => undefined)) as
          | { ok?: boolean; error?: string; channel?: string; ts?: string }
          | undefined;

        if (res.status === 429) return fail(summary, mapSlackError("ratelimited", values));
        if (res.status >= 500 || (!body && !res.ok)) {
          return fail(summary, {
            category_hint: "unavailable", code: `http_${res.status}`, message: "Slack had a problem on its side.",
            retryable: true, outcome: "uncertain",
          });
        }
        if (body?.ok === true) {
          if (body.channel && body.ts) return { ok: true, externalRef: `${body.channel}:${body.ts}`, requestSummary: summary };
          return fail(summary, {
            category_hint: "unknown", code: "bad_response", message: "Slack answered without a message timestamp.",
            retryable: true, outcome: "uncertain",
          });
        }
        return fail(summary, mapSlackError(typeof body?.error === "string" ? body.error : "unknown_error", values));
      } catch {
        return fail(summary, {
          category_hint: "unavailable",
          code: timedOut ? "timeout" : "network_error",
          message: timedOut ? "Slack did not answer in time." : "The connection to Slack was interrupted.",
          retryable: true,
          outcome: "uncertain",
        });
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export const slackAdapter: AppAdapter = createSlackAdapter();
