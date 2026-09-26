import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { loadEnvLocal } from "../../db/connection";

/**
 * Gets a short-lived Google access token for a TEST account, for the fixture recorders (Gmail, Drive).
 * It opens Google's consent page (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET come from .env.local and are never printed),
 * catches the return on http://localhost:3000 (stop the dev server first), and keeps the token in memory only.
 * The caller must call revoke() at the end. Set GOOGLE_TEST_ACCESS_TOKEN to use a token you already have.
 * (scripts/record-calendar-fixtures.ts has its own copy of this flow; it was left as it was.)
 */
const REDIRECT_URI = "http://localhost:3000/api/connections/google/callback";

export async function getGoogleToken(scope: string): Promise<{ token: string; revoke: () => Promise<void> }> {
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
    client_id: clientId, redirect_uri: REDIRECT_URI, response_type: "code", scope,
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
