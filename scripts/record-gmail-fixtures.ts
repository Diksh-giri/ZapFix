import { mkdirSync, writeFileSync } from "node:fs";
import { createGmailAdapter } from "../server/adapters/gmail";
import { sanitizeGoogleBody } from "../server/adapters/google-calendar/sanitize";
import { getGoogleToken } from "./lib/google-token";

/**
 * Records REAL Gmail responses as sanitized fixtures (T11, Gmail). Run it yourself, with a TEST Google account:
 *   GMAIL_TEST_TO=your-own-test-address@example.com npx tsx scripts/record-gmail-fixtures.ts
 * It opens Google's consent page, you click Allow with the TEST account, and it catches the return on
 * http://localhost:3000 (stop the dev server first). The token stays in memory and is revoked at the end.
 * It sends ONE real email (the "success" case) to GMAIL_TEST_TO, so use an address you own. The other cases are
 * refused by Gmail and send nothing. The gmail.send scope cannot delete mail: delete the test message from
 * the Sent folder yourself. The sanitizer removes tokens, emails, quoted values and message ids from everything saved.
 * Review tests/fixtures/gmail/*.json before committing.
 */
const SCOPE = "https://www.googleapis.com/auth/gmail.send";
const to = process.env.GMAIL_TEST_TO;
if (!to) {
  console.error("Set GMAIL_TEST_TO to an address you own, for example: GMAIL_TEST_TO=you@example.com npx tsx scripts/record-gmail-fixtures.ts");
  process.exit(1);
}

const good = { to, subject: "ZapFix fixture test", body: "Test message from the ZapFix fixture recorder. You can delete it." };
const scenarios: Array<{ name: string; description: string; values: Record<string, string>; token?: string }> = [
  { name: "success", description: "A valid email is sent (the only case that sends anything).", values: good },
  { name: "empty_to", description: "The recipient is empty (missing required field).", values: { ...good, to: "" } },
  { name: "invalid_to", description: "The recipient is not an email address.", values: { ...good, to: "not-an-email" } },
  { name: "empty_subject", description: "The subject is empty.", values: { ...good, subject: "" } },
  { name: "invalid_token", description: "An expired or revoked access token.", values: good, token: "ya29.invalid-token-for-fixture" },
];

/** Message ids are opaque but identify a real message: keep the shape, drop the value. */
const maskIds = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(maskIds)
    : v && typeof v === "object"
      ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "id" || k === "threadId" ? "[id]" : maskIds(x)]))
      : v;

async function main() {
  const { token, revoke } = await getGoogleToken(SCOPE);
  mkdirSync("tests/fixtures/gmail", { recursive: true });
  try {
    for (const s of scenarios) {
      const useToken = s.token ?? token;
      let captured: { status: number; body: unknown } | undefined;
      const capturingFetch: typeof fetch = async (input, init) => {
        const res = await fetch(input, init);
        captured = { status: res.status, body: await res.clone().json().catch(() => undefined) };
        return res;
      };
      const result = await createGmailAdapter(capturingFetch).execute("send_email", s.values, {
        accessToken: useToken,
        idempotencyKey: `fixture-${s.name}-${Date.now()}:action:1`,
        timeoutMs: 15_000,
      });
      const fixture = {
        scenario: s.name,
        description: s.description,
        recorded_at: new Date().toISOString().slice(0, 10),
        request_shape: result.requestSummary,
        response: { status: captured?.status ?? null, body: maskIds(sanitizeGoogleBody(captured?.body, useToken)) },
        mapped: result.ok ? { ok: true } : { ok: false, error: result.error },
      };
      writeFileSync(`tests/fixtures/gmail/${s.name}.json`, JSON.stringify(fixture, null, 2) + "\n");
      console.log(`${s.name.padEnd(16)} HTTP ${String(captured?.status).padEnd(4)} -> ${result.ok ? "ok" : result.error.category_hint}`);
    }
  } finally {
    await revoke();
  }
  console.log("\nDone (test token revoked). Delete the test email from the Sent folder, and review tests/fixtures/gmail/*.json before you commit.");
}

main().catch((e: Error) => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
