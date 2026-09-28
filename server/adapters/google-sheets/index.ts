import type { StandardError } from "@/lib/schemas/standard-error";
import { baseGoogleError, describeGoogleError, googleRequest, type GoogleErrorBody } from "../google-http";
import type { AppAdapter, ExecuteContext, ExecuteResult } from "../types";
import { missingRequiredMappings } from "../types";

/**
 * Appends one row with spreadsheets.values.append using the existing Google connection. Row values are represented
 * by the adapter contract as one string, with one cell per line. RAW input prevents a value beginning with "=" from
 * being evaluated as a formula. Sheets has no idempotency key for append, so interrupted calls remain uncertain.
 */
const ENDPOINT = "https://sheets.googleapis.com/v4/spreadsheets";

const fail = (requestSummary: Record<string, string>, error: StandardError): ExecuteResult => ({
  ok: false,
  requestSummary,
  error,
});

const rowValues = (value: string) => value.split(/\r?\n/);
const a1SheetName = (value: string) => `'${value.replaceAll("'", "''")}'`;

function fieldFrom(location: string | undefined, message: string): string | undefined {
  for (const text of [location ?? "", message]) {
    if (/\b(range|sheet|tab)\b|unable to parse range/i.test(text)) return "sheet_name";
    if (/\bspreadsheet\b/i.test(text)) return "spreadsheet_id";
    if (/\bvalue/i.test(text)) return "values";
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

  const field = fieldFrom(info.location, info.rawMessage);
  const missing =
    info.reason === "required" ||
    (field !== undefined
      ? (values[field] ?? "") === ""
      : /\b(required|missing|empty|blank)\b/i.test(info.rawMessage));
  return {
    code: info.code,
    message: info.message,
    retryable: false,
    outcome: "not_executed",
    category_hint: missing ? "missing_field" : "invalid_value",
    ...(field ? { field } : {}),
  };
}

export function createGoogleSheetsAdapter(fetchFn: typeof fetch = fetch): AppAdapter {
  return {
    id: "google_sheets",
    provider: "google",
    actions: [
      {
        key: "append_row",
        label: "Append row",
        fields: [
          { key: "spreadsheet_id", label: "Spreadsheet", required: true, type: "text" },
          { key: "sheet_name", label: "Sheet name", required: true, type: "text" },
          { key: "values", label: "Row values", required: true, type: "text_list" },
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
        (action?.fields ?? []).map((field) => [field.key, (values[field.key] ?? "") === "" ? "empty" : "provided"]),
      );
      if (!action) {
        return fail(summary, {
          category_hint: "unknown", code: "unknown_action", message: "Unknown action",
          retryable: false, outcome: "not_executed",
        });
      }

      const spreadsheetId = encodeURIComponent(values.spreadsheet_id ?? "");
      const range = encodeURIComponent(a1SheetName(values.sheet_name ?? ""));
      const sent = await googleRequest(
        fetchFn,
        `${ENDPOINT}/${spreadsheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS&includeValuesInResponse=false`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${ctx.accessToken}`, "content-type": "application/json" },
          body: JSON.stringify({ majorDimension: "ROWS", values: [rowValues(values.values ?? "")] }),
        },
        ctx.timeoutMs,
        "Google Sheets",
      );
      if (!sent.ok) return fail(summary, sent.error);

      const body = sent.body as (GoogleErrorBody & { updates?: { updatedRange?: string } }) | undefined;
      if (sent.res.ok) {
        const updatedRange = body?.updates?.updatedRange;
        if (typeof updatedRange === "string" && updatedRange) {
          return { ok: true, externalRef: updatedRange, requestSummary: summary };
        }
        return fail(summary, {
          category_hint: "unknown", code: "bad_response", message: "Google Sheets answered without an updated range.",
          retryable: true, outcome: "uncertain",
        });
      }
      return fail(summary, mapHttpError(sent.res.status, body, ctx.accessToken, values));
    },
  };
}

export const googleSheetsAdapter: AppAdapter = createGoogleSheetsAdapter();
