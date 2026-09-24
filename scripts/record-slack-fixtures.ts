import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { loadEnvLocal } from "../db/connection";
import { createSlackAdapter } from "../server/adapters/slack";
import { sanitizeSlackBody } from "../server/adapters/slack/sanitize";

/**
 * Records REAL Slack responses as sanitized fixtures (T25). Run it yourself, on a TEST workspace and channel:
 *   SLACK_TEST_CHANNEL=#your-test-channel npx tsx scripts/record-slack-fixtures.ts
 * It opens Slack's consent page (uses SLACK_CLIENT_ID and SLACK_CLIENT_SECRET from .env.local, never printed), you click
 * Allow, and it catches the return on http://localhost:3000 (stop the dev server first). The bot token stays in memory,
 * is never written to a file, and is revoked at the end. The sanitizer keeps only ok/error/channel/ts-style fields.
 * Review tests/fixtures/slack/*.json before committing. It posts ONE real message to the channel and deletes it again.
 * Alternative: set SLACK_TEST_BOT_TOKEN for this command to use a bot token you already have.
 */
const REDIRECT_URI = "http://localhost:3000/api/connections/slack/callback";
const channel = process.env.SLACK_TEST_CHANNEL;

async function getToken(): Promise<{ token: string; revoke: () => Promise<void> }> {
  if (process.env.SLACK_TEST_BOT_TOKEN) return { token: process.env.SLACK_TEST_BOT_TOKEN, revoke: async () => {} };

  loadEnvLocal();
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("SLACK_CLIENT_ID and SLACK_CLIENT_SECRET must be set in .env.local.");
    process.exit(1);
  }

  const state = randomBytes(24).toString("base64url");
  const authUrl = new URL("https://slack.com/oauth/v2/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("scope", "chat:write,chat:write.public");
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("state", state);

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost:3000");
      if (url.pathname !== "/api/connections/slack/callback") {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get("code");
      const ok = url.searchParams.get("state") === state && code;
      res.writeHead(ok ? 200 : 400, { "content-type": "text/plain" });
      res.end(ok ? "Done. You can close this tab and go back to the terminal." : "That did not work. Go back to the terminal.");
      server.close();
      if (ok && code) resolve(code);
      else reject(new Error(`Slack did not return a code (${url.searchParams.get("error") ?? "state mismatch"}).`));
    });
    server.on("error", (e) => reject(new Error(`Could not listen on port 3000 (${(e as NodeJS.ErrnoException).code}). Stop the dev server and try again.`)));
    server.listen(3000, () => {
      console.log("Opening Slack's consent page. Choose your TEST workspace and click Allow...");
      execFileSync("open", [authUrl.toString()]);
    });
    setTimeout(() => reject(new Error("Timed out waiting for consent (4 minutes).")), 240_000).unref();
  });

  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: REDIRECT_URI }).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; access_token?: string; error?: string };
  if (!body.ok || !body.access_token) throw new Error(`Slack did not accept the code (${body.error ?? `HTTP ${res.status}`}).`);
  const token = body.access_token;
  return {
    token,
    revoke: async () => {
      await fetch("https://slack.com/api/auth.revoke", { method: "POST", headers: { authorization: `Bearer ${token}` } }).catch(() => undefined);
    },
  };
}

const scenarios = (ch: string): Array<{ name: string; description: string; values: Record<string, string>; token?: string }> => [
  { name: "success", description: "A message is posted to a channel the app can post to.", values: { channel: ch, text: "ZapFix fixture test" } },
  { name: "empty_channel", description: "The channel value is empty.", values: { channel: "", text: "ZapFix fixture test" } },
  { name: "unknown_channel", description: "The channel does not exist.", values: { channel: "zapfix-channel-that-does-not-exist", text: "ZapFix fixture test" } },
  { name: "empty_text", description: "The message text is empty.", values: { channel: ch, text: "" } },
  { name: "invalid_token", description: "An invalid or revoked bot token.", values: { channel: ch, text: "ZapFix fixture test" }, token: "xoxb-invalid-token-for-fixture" },
];

async function main() {
  if (!channel) {
    console.error("Set SLACK_TEST_CHANNEL for this command, for example SLACK_TEST_CHANNEL=#zapfix-test (a TEST channel).");
    process.exit(1);
  }
  const { token, revoke } = await getToken();
  mkdirSync("tests/fixtures/slack", { recursive: true });

  for (const s of scenarios(channel)) {
    const useToken = s.token ?? token;
    let captured: { status: number; body: unknown } | undefined;
    const capturingFetch: typeof fetch = async (input, init) => {
      const res = await fetch(input, init);
      captured = { status: res.status, body: await res.clone().json().catch(() => undefined) };
      return res;
    };
    const result = await createSlackAdapter(capturingFetch).execute("post_message", s.values, {
      accessToken: useToken,
      idempotencyKey: `fixture-${s.name}-${Date.now()}:action:1`,
      timeoutMs: 15_000,
    });

    const fixture = {
      scenario: s.name,
      description: s.description,
      recorded_at: new Date().toISOString().slice(0, 10),
      request_shape: result.requestSummary,
      response: { status: captured?.status ?? null, body: sanitizeSlackBody(captured?.body, useToken) },
      mapped: result.ok ? { ok: true } : { ok: false, error: result.error },
    };
    writeFileSync(`tests/fixtures/slack/${s.name}.json`, JSON.stringify(fixture, null, 2) + "\n");
    console.log(`${s.name.padEnd(18)} HTTP ${String(captured?.status).padEnd(4)} -> ${result.ok ? "ok" : `${result.error.category_hint} (${result.error.code})`}`);

    if (result.ok && s.name === "success") {
      const [ch, ts] = result.externalRef.split(":");
      await fetch("https://slack.com/api/chat.delete", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ channel: ch, ts }),
      }).catch(() => undefined);
      console.log("  (test message deleted)");
    }
  }
  await revoke();
  console.log("\nDone (test token revoked). Review tests/fixtures/slack/*.json before you commit.");
}

main().catch((e: Error) => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
