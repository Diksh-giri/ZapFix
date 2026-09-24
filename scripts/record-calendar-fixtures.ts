import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { loadEnvLocal } from "../db/connection";
import { createGoogleCalendarAdapter } from "../server/adapters/google-calendar";
import { sanitizeGoogleBody } from "../server/adapters/google-calendar/sanitize";

/**
 * Records REAL Google Calendar responses as sanitized fixtures (T11, step 5). Run it yourself, on a TEST calendar:
 *   npx tsx scripts/record-calendar-fixtures.ts
 * It opens Google's consent page (uses GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from .env.local, never printed),
 * you click Allow with your TEST account, and it catches the return on http://localhost:3000 (stop the dev server first).
 * The token stays in memory, is never written to a file, and is revoked at the end. The sanitizer removes tokens,
 * emails, quoted values and personal event fields from everything saved. Review tests/fixtures/google-calendar/*.json
 * before committing. It creates one real event on the primary calendar and deletes it again.
 * Alternative: set GOOGLE_TEST_ACCESS_TOKEN for this command to use a token you already have.
 */
const REDIRECT_URI = "http://localhost:3000/api/connections/google/callback";
const SCOPE = "https://www.googleapis.com/auth/calendar.events.owned";

async function getToken(): Promise<{ token: string; revoke: () => Promise<void> }> {
  if (process.env.GOOGLE_TEST_ACCESS_TOKEN) return { token: process.env.GOOGLE_TEST_ACCESS_TOKEN, revoke: async () => {} };

  loadEnvLocal();
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env.local.");
    process.exit(1);
  }

  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  for (const [k, v] of Object.entries({
    client_id: clientId, redirect_uri: REDIRECT_URI, response_type: "code", scope: SCOPE,
    state, code_challenge: challenge, code_challenge_method: "S256", prompt: "consent",
  })) authUrl.searchParams.set(k, v);

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost:3000");
      if (url.pathname !== "/api/connections/google/callback") {
        res.writeHead(404).end();
        return;
      }
      const ok = url.searchParams.get("state") === state && url.searchParams.get("code");
      res.writeHead(ok ? 200 : 400, { "content-type": "text/plain" });
      res.end(ok ? "Done. You can close this tab and go back to the terminal." : "That did not work. Go back to the terminal.");
      server.close();
      if (ok) resolve(url.searchParams.get("code")!);
      else reject(new Error(`Google did not return a code (${url.searchParams.get("error") ?? "state mismatch"}).`));
    });
    server.on("error", (e) => reject(new Error(`Could not listen on port 3000 (${(e as NodeJS.ErrnoException).code}). Stop the dev server and try again.`)));
    server.listen(3000, () => {
      console.log("Opening Google's consent page. Sign in with your TEST account and click Allow...");
      execFileSync("open", [authUrl.toString()]);
    });
    setTimeout(() => reject(new Error("Timed out waiting for consent (4 minutes).")), 240_000).unref();
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code", code, code_verifier: verifier,
      client_id: clientId, client_secret: clientSecret, redirect_uri: REDIRECT_URI,
    }).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string };
  if (!res.ok || !body.access_token) throw new Error(`Google did not accept the code (HTTP ${res.status}).`);
  const token = body.access_token;
  return {
    token,
    revoke: async () => {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }).toString(),
      }).catch(() => undefined);
    },
  };
}

const good = {
  title: "ZapFix fixture test",
  start: "2030-01-15T10:00:00Z",
  end: "2030-01-15T11:00:00Z",
  attendee_email: "fixture-guest@example.com",
};

const scenarios: Array<{ name: string; description: string; values: Record<string, string>; token?: string }> = [
  { name: "success", description: "A valid event is created.", values: good },
  { name: "empty_attendee_email", description: "The attendee email is empty (missing required field).", values: { ...good, attendee_email: "" } },
  { name: "invalid_date_format", description: "The start date is 03/15/2026 instead of RFC 3339.", values: { ...good, start: "03/15/2026" } },
  { name: "invalid_token", description: "An expired or revoked access token.", values: good, token: "ya29.invalid-token-for-fixture" },
];

async function main() {
  const { token, revoke } = await getToken();
  mkdirSync("tests/fixtures/google-calendar", { recursive: true });
  for (const s of scenarios) {
    const useToken = s.token ?? token;
    let captured: { status: number; body: unknown } | undefined;
    const capturingFetch: typeof fetch = async (input, init) => {
      const res = await fetch(input, init);
      const body: unknown = await res.clone().json().catch(() => undefined);
      captured = { status: res.status, body };
      return res;
    };
    const result = await createGoogleCalendarAdapter(capturingFetch).execute("create_event", s.values, {
      accessToken: useToken,
      idempotencyKey: `fixture-${s.name}-${Date.now()}:action:1`,
      timeoutMs: 15_000,
    });

    const fixture = {
      scenario: s.name,
      description: s.description,
      recorded_at: new Date().toISOString().slice(0, 10),
      request_shape: result.requestSummary,
      response: { status: captured?.status ?? null, body: sanitizeGoogleBody(captured?.body, useToken) },
      mapped: result.ok ? { ok: true } : { ok: false, error: result.error },
    };
    writeFileSync(`tests/fixtures/google-calendar/${s.name}.json`, JSON.stringify(fixture, null, 2) + "\n");
    console.log(`${s.name.padEnd(22)} HTTP ${String(captured?.status).padEnd(4)} -> ${result.ok ? "ok" : result.error.category_hint}`);

    if (result.ok && s.name === "success") {
      await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${result.externalRef}?sendUpdates=none`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      }).catch(() => undefined);
      console.log("  (test event deleted)");
    }
  }
  await revoke();
  console.log("\nDone (test token revoked). Review tests/fixtures/google-calendar/*.json for anything personal before you commit.");
}

main().catch((e: Error) => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
