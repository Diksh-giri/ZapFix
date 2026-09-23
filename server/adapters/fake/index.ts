import type { AppAdapter, ExecuteContext, ExecuteResult } from "../types";
import { missingRequiredMappings } from "../types";
import type { ActionConfig } from "@/lib/schemas/workflow-config";
import type { StandardError } from "@/lib/schemas/standard-error";

/**
 * TEST DOUBLE, not part of the product (Decision #001: the product uses real apps).
 * Purpose: let both of you build and test the run/diagnose/approve/retry loop and the UI
 * before the real Google/Slack adapters exist, and keep unit tests fast and deterministic.
 * Never register this in the production registry.
 *
 * Behavior mirrors the three PRD failure types:
 *  - a required value that is empty        -> missing_field
 *  - a datetime that is not RFC 3339       -> invalid_value
 *  - accessToken === "expired"             -> auth
 */
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function failure(
  requestSummary: Record<string, string>,
  error: StandardError,
): ExecuteResult {
  return { ok: false, requestSummary, error };
}

export const fakeAdapter: AppAdapter = {
  id: "google_calendar", // pretends to be Calendar so screens and rules can be exercised
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

  validateConfig(actionKey: string, config: ActionConfig) {
    const action = this.actions.find((a) => a.key === actionKey);
    return action ? missingRequiredMappings(action, config) : [`Unknown action "${actionKey}"`];
  },

  async execute(actionKey, values, ctx: ExecuteContext): Promise<ExecuteResult> {
    const action = this.actions.find((a) => a.key === actionKey);
    const summary = Object.fromEntries(Object.keys(values).map((k) => [k, "provided"]));
    if (!action) {
      return failure(summary, {
        category_hint: "unknown", code: "unknown_action", message: "Unknown action",
        retryable: false, outcome: "not_executed",
      });
    }
    if (ctx.accessToken === "expired") {
      return failure(summary, {
        category_hint: "auth", code: "invalid_grant", message: "Token has been expired or revoked",
        retryable: false, outcome: "not_executed",
      });
    }
    for (const f of action.fields) {
      const v = values[f.key] ?? "";
      if (f.required && v === "") {
        return failure(summary, {
          category_hint: "missing_field", code: "required", message: `Missing required field: ${f.key}`,
          field: f.key, retryable: false, outcome: "not_executed",
        });
      }
      if (f.type === "datetime_rfc3339" && !RFC3339.test(v)) {
        return failure(summary, {
          category_hint: "invalid_value", code: "invalid_datetime",
          message: `Invalid ${f.key}: expected RFC 3339`,
          field: f.key, retryable: false, outcome: "not_executed",
        });
      }
    }
    return { ok: true, externalRef: `fake-${ctx.idempotencyKey}`, requestSummary: summary };
  },
};
