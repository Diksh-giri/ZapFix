import { describe, expect, it, vi } from "vitest";
import { StandardErrorSchema } from "@/lib/schemas/standard-error";
import { createGoogleSheetsAdapter } from "@/server/adapters/google-sheets";

const values = { spreadsheet_id: "sheet/id with spaces", sheet_name: "Team's results", values: "Ada\nReady, with notes\n=SUM(A1:A2)" };
const ctx = { accessToken: "ya29.secret-access-token", idempotencyKey: "run-1:action:1", timeoutMs: 1000 };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const googleError = (status: number, reason: string, message = "Something", location?: string) =>
  json({ error: { code: status, message, errors: [{ reason, message, ...(location ? { location } : {}) }] } }, status);

async function run(fetchFn: typeof fetch, input: Record<string, string> = values, actionKey = "append_row") {
  return createGoogleSheetsAdapter(fetchFn).execute(actionKey, input, ctx);
}

describe("append_row request", () => {
  it("appends one RAW row, safely encoding the spreadsheet id and quoted sheet name", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ updates: { updatedRange: "'Team''s results'!A4:C4" } }));
    await run(fetchFn);
    const [rawUrl, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const url = new URL(rawUrl);
    expect(url.origin + url.pathname).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/sheet%2Fid%20with%20spaces/values/'Team''s%20results':append",
    );
    expect(url.searchParams.get("valueInputOption")).toBe("RAW");
    expect(url.searchParams.get("insertDataOption")).toBe("INSERT_ROWS");
    expect(url.searchParams.get("includeValuesInResponse")).toBe("false");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer ya29.secret-access-token");
    expect(JSON.parse(String(init.body))).toEqual({
      majorDimension: "ROWS",
      values: [["Ada", "Ready, with notes", "=SUM(A1:A2)"]],
    });
  });
});

describe("append_row results", () => {
  it("returns the updated range without exposing cell values", async () => {
    const result = await run(vi.fn().mockResolvedValue(json({ updates: { updatedRange: "Sheet1!A2:C2" } })));
    expect(result).toEqual({
      ok: true,
      externalRef: "Sheet1!A2:C2",
      requestSummary: { spreadsheet_id: "provided", sheet_name: "provided", values: "provided" },
    });
    expect(JSON.stringify(result)).not.toContain("Ada");
    expect(JSON.stringify(result)).not.toContain("Ready, with notes");
  });

  it("treats a successful response without an updated range as uncertain", async () => {
    const result = await run(vi.fn().mockResolvedValue(json({ updates: {} })));
    expect(result).toMatchObject({ ok: false, error: { code: "bad_response", outcome: "uncertain" } });
  });
});

describe("append_row failures", () => {
  const cases: Array<[string, Response, Record<string, unknown>]> = [
    ["expired token", googleError(401, "authError", "Invalid Credentials"), { category_hint: "auth", outcome: "not_executed" }],
    ["permission denied", googleError(403, "forbidden", "The caller does not have permission"), { category_hint: "auth", outcome: "not_executed" }],
    ["spreadsheet missing", googleError(404, "notFound", "Requested entity was not found"), { category_hint: "not_found", outcome: "not_executed" }],
    ["rate limited", googleError(429, "rateLimitExceeded"), { category_hint: "rate_limit", retryable: true }],
    ["service unavailable", googleError(503, "backendError"), { category_hint: "unavailable", outcome: "uncertain" }],
  ];

  it.each(cases)("maps %s to a StandardError", async (_name, response, expected) => {
    const result = await run(vi.fn().mockResolvedValue(response));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject(expected);
      expect(StandardErrorSchema.safeParse(result.error).success).toBe(true);
    }
  });

  it("identifies an invalid sheet name from Google's range error", async () => {
    const result = await run(vi.fn().mockResolvedValue(googleError(400, "badRequest", "Unable to parse range: Missing tab")));
    expect(result).toMatchObject({ ok: false, error: { category_hint: "invalid_value", field: "sheet_name" } });
  });

  it("sanitizes values and tokens echoed by Google", async () => {
    const result = await run(
      vi.fn().mockResolvedValue(googleError(400, "badRequest", 'Value "Ada" rejected for Bearer ya29.secret-access-token')),
    );
    expect(JSON.stringify(result)).not.toContain("Ada");
    expect(JSON.stringify(result)).not.toContain("ya29.secret-access-token");
  });

  it("rejects an unknown action without calling Google", async () => {
    const fetchFn = vi.fn();
    const result = await run(fetchFn, values, "clear_sheet");
    expect(fetchFn).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, error: { code: "unknown_action", outcome: "not_executed" } });
  });
});

describe("append_row uncertain outcomes", () => {
  it("marks a timeout as uncertain because the row may have been appended", async () => {
    const hang = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    const result = await createGoogleSheetsAdapter(hang as unknown as typeof fetch)
      .execute("append_row", values, { ...ctx, timeoutMs: 20 });
    expect(result).toMatchObject({ ok: false, error: { code: "timeout", outcome: "uncertain", retryable: true } });
  });

  it("marks a dropped connection as uncertain", async () => {
    const result = await run(vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect(result).toMatchObject({ ok: false, error: { code: "network_error", outcome: "uncertain" } });
  });
});
