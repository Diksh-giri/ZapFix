import { mkdirSync, writeFileSync } from "node:fs";
import { createGoogleDriveAdapter } from "../server/adapters/google-drive";
import { sanitizeGoogleBody } from "../server/adapters/google-calendar/sanitize";
import { getGoogleToken } from "./lib/google-token";

/**
 * Records REAL Google Drive responses as sanitized fixtures (T11, Drive). Run it yourself, with a TEST Google account:
 *   npx tsx scripts/record-drive-fixtures.ts
 * It opens Google's consent page, you click Allow with the TEST account, and it catches the return on
 * http://localhost:3000 (stop the dev server first). The token stays in memory and is revoked at the end.
 * It creates ONE real file ("success" case, and possibly one for an empty name if Drive allows it) and deletes
 * every file it created before it finishes. The sanitizer removes tokens, emails, quoted values and file ids.
 * Review tests/fixtures/google-drive/*.json before committing.
 */
const SCOPE = "https://www.googleapis.com/auth/drive.file";

const good = { name: "ZapFix fixture test.txt", content: "Test file from the ZapFix fixture recorder." };
const scenarios: Array<{ name: string; description: string; values: Record<string, string>; token?: string }> = [
  { name: "success", description: "A valid file is created.", values: good },
  { name: "empty_name", description: "The file name is empty.", values: { ...good, name: "" } },
  { name: "empty_content", description: "The content is empty (it is optional).", values: { ...good, content: "" } },
  { name: "invalid_token", description: "An expired or revoked access token.", values: good, token: "ya29.invalid-token-for-fixture" },
];

const maskIds = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(maskIds)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "id" ? "[id]" : maskIds(x)]))
      : v;

async function main() {
  const { token, revoke } = await getGoogleToken(SCOPE);
  mkdirSync("tests/fixtures/google-drive", { recursive: true });
  const created: string[] = [];
  try {
    for (const s of scenarios) {
      const useToken = s.token ?? token;
      let captured: { status: number; body: unknown } | undefined;
      const capturingFetch: typeof fetch = async (input, init) => {
        const res = await fetch(input, init);
        captured = { status: res.status, body: await res.clone().json().catch(() => undefined) };
        return res;
      };
      const result = await createGoogleDriveAdapter(capturingFetch).execute("create_file", s.values, {
        accessToken: useToken,
        idempotencyKey: `fixture-${s.name}-${Date.now()}:action:1`,
        timeoutMs: 15_000,
      });
      if (result.ok && result.externalRef) created.push(result.externalRef);
      const fixture = {
        scenario: s.name,
        description: s.description,
        recorded_at: new Date().toISOString().slice(0, 10),
        request_shape: result.requestSummary,
        response: { status: captured?.status ?? null, body: maskIds(sanitizeGoogleBody(captured?.body, useToken)) },
        mapped: result.ok ? { ok: true } : { ok: false, error: result.error },
      };
      writeFileSync(`tests/fixtures/google-drive/${s.name}.json`, JSON.stringify(fixture, null, 2) + "\n");
      console.log(`${s.name.padEnd(16)} HTTP ${String(captured?.status).padEnd(4)} -> ${result.ok ? "ok" : result.error.category_hint}`);
    }
  } finally {
    for (const id of created) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
    if (created.length > 0) console.log(`  (${created.length} test file(s) deleted)`);
    await revoke();
  }
  console.log("\nDone (test token revoked). Review tests/fixtures/google-drive/*.json before you commit.");
}

main().catch((e: Error) => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
