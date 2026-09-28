import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createGoogleSheetsAdapter } from "@/server/adapters/google-sheets";

interface Fixture {
  response: { status: number; body: unknown };
  mapped: { ok: boolean; error?: Record<string, unknown> };
}

function load(name: string): Fixture {
  return JSON.parse(readFileSync(`tests/fixtures/google-sheets/${name}.json`, "utf8")) as Fixture;
}

async function replay(name: string) {
  const fixture = load(name);
  const fetchFn = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(fixture.response.body), {
      status: fixture.response.status,
      headers: { "content-type": "application/json" },
    }),
  );
  const result = await createGoogleSheetsAdapter(fetchFn).execute(
    "append_row",
    { spreadsheet_id: "replay-sheet", sheet_name: "Sheet1", values: "fixture" },
    { accessToken: "ya29.replay-token", idempotencyKey: "run-1:action:1", timeoutMs: 1000 },
  );
  return { fixture, result };
}

describe("real Google Sheets responses (recorded fixtures)", () => {
  it("maps Google's invalid-token response to an auth failure that was not executed", async () => {
    const { result } = await replay("invalid_token");
    expect(result).toMatchObject({
      ok: false,
      error: { category_hint: "auth", code: "http_401", outcome: "not_executed", retryable: false },
    });
  });

  it("keeps the saved mapping aligned with the adapter", async () => {
    const { fixture, result } = await replay("invalid_token");
    expect(fixture.mapped.ok).toBe(result.ok);
    if (!result.ok) expect(fixture.mapped.error).toEqual(result.error);
  });

  it("contains no access tokens or personal cell data", () => {
    const text = readFileSync("tests/fixtures/google-sheets/invalid_token.json", "utf8");
    expect(text).not.toMatch(/ya29\.|Bearer\s+\w/);
    expect(text).not.toContain("ZapFix fixture");
  });
});
