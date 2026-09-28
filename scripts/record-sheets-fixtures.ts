import { mkdirSync, writeFileSync } from "node:fs";
import { createGoogleSheetsAdapter } from "../server/adapters/google-sheets";
import { sanitizeGoogleBody } from "../server/adapters/google-calendar/sanitize";
import { getGoogleToken } from "./lib/google-token";

/**
 * Records REAL Google Sheets responses for T26 against a disposable TEST spreadsheet:
 *   SHEETS_TEST_SPREADSHEET_ID=<id> SHEETS_TEST_SHEET_NAME=<tab> npx tsx scripts/record-sheets-fixtures.ts
 *
 * The success row is cleared immediately after capture. Set SHEETS_FORBIDDEN_SPREADSHEET_ID to a spreadsheet that
 * the test account cannot edit if you also want to capture Google's permission response. The short-lived token stays
 * in memory and is revoked at the end. Review every generated fixture before committing it.
 */
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const spreadsheetId = process.env.SHEETS_TEST_SPREADSHEET_ID;
const sheetName = process.env.SHEETS_TEST_SHEET_NAME;

if (!spreadsheetId || !sheetName) {
  console.error("SHEETS_TEST_SPREADSHEET_ID and SHEETS_TEST_SHEET_NAME must name a disposable test sheet.");
  process.exit(1);
}

const good = { spreadsheet_id: spreadsheetId, sheet_name: sheetName, values: "ZapFix fixture\nrecorded" };
const scenarios: Array<{ name: string; description: string; values: Record<string, string>; token?: string }> = [
  { name: "success", description: "A row is appended to a test sheet, then cleared.", values: good },
  { name: "missing_sheet", description: "The requested sheet tab does not exist.", values: { ...good, sheet_name: "ZapFix missing fixture tab" } },
  { name: "invalid_token", description: "An expired or invalid access token.", values: good, token: "ya29.invalid-token-for-fixture" },
];
if (process.env.SHEETS_FORBIDDEN_SPREADSHEET_ID) {
  scenarios.push({
    name: "permission_denied",
    description: "The test account cannot edit the requested spreadsheet.",
    values: { ...good, spreadsheet_id: process.env.SHEETS_FORBIDDEN_SPREADSHEET_ID },
  });
}

function sanitizeSheetsBody(value: unknown, accessToken: string): unknown {
  const clean = sanitizeGoogleBody(value, accessToken);
  if (!clean || typeof clean !== "object" || Array.isArray(clean)) return clean;
  return Object.fromEntries(
    Object.entries(clean).map(([key, item]) => [
      key,
      ["spreadsheetId", "tableRange", "updatedRange"].includes(key) ? `[${key}]` : sanitizeSheetsBody(item, accessToken),
    ]),
  );
}

async function clearRecordedRow(token: string, id: string, updatedRange: string) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(updatedRange)}:clear`;
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: "{}",
  });
  if (!response.ok) throw new Error(`The fixture row was appended but could not be cleared (HTTP ${response.status}).`);
}

async function main() {
  const { token, revoke } = await getGoogleToken(SCOPE);
  mkdirSync("tests/fixtures/google-sheets", { recursive: true });
  try {
    for (const scenario of scenarios) {
      const useToken = scenario.token ?? token;
      let captured: { status: number; body: unknown } | undefined;
      const capturingFetch: typeof fetch = async (input, init) => {
        const response = await fetch(input, init);
        captured = { status: response.status, body: await response.clone().json().catch(() => undefined) };
        return response;
      };
      const result = await createGoogleSheetsAdapter(capturingFetch).execute("append_row", scenario.values, {
        accessToken: useToken,
        idempotencyKey: `fixture-${scenario.name}-${Date.now()}:action:1`,
        timeoutMs: 15_000,
      });
      if (scenario.name === "success" && result.ok) {
        await clearRecordedRow(token, scenario.values.spreadsheet_id ?? "", result.externalRef);
      }
      const fixture = {
        scenario: scenario.name,
        description: scenario.description,
        recorded_at: new Date().toISOString().slice(0, 10),
        request_shape: result.requestSummary,
        response: { status: captured?.status ?? null, body: sanitizeSheetsBody(captured?.body, useToken) },
        mapped: result.ok ? { ok: true } : { ok: false, error: result.error },
      };
      writeFileSync(`tests/fixtures/google-sheets/${scenario.name}.json`, `${JSON.stringify(fixture, null, 2)}\n`);
      console.log(`${scenario.name.padEnd(18)} HTTP ${String(captured?.status).padEnd(4)} -> ${result.ok ? "ok" : result.error.category_hint}`);
    }
  } finally {
    await revoke();
  }
  console.log("\nDone. Review tests/fixtures/google-sheets/*.json before committing.");
}

main().catch((error: Error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
