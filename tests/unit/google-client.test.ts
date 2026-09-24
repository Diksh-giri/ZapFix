import { describe, expect, it, vi } from "vitest";
import { buildAuthUrl, createGoogleClient } from "@/server/connections/google";
import { GOOGLE_IDENTITY_SCOPES, requestedGoogleScopes, SLACK_BOT_SCOPES } from "@/server/connections/scopes";
import { TokenRefreshError } from "@/server/connections/access-token";

const cfg = {
  clientId: "client-123.apps.googleusercontent.com",
  clientSecret: "GOCSPX-super-secret",
  redirectUri: "http://localhost:3000/api/connections/google/callback",
};
const now = new Date("2026-09-24T12:00:00Z");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function bodyOf(call: unknown[]): URLSearchParams {
  return new URLSearchParams(String((call[1] as RequestInit).body));
}

describe("scopes", () => {
  it("asks only for the approved scopes", () => {
    expect(requestedGoogleScopes()).toEqual([
      ...GOOGLE_IDENTITY_SCOPES,
      "https://www.googleapis.com/auth/calendar.events.owned",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/drive.file",
    ]);
  });

  it("never asks for a restricted Gmail or Drive scope", () => {
    const all = requestedGoogleScopes();
    for (const banned of [
      "https://mail.google.com/",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.compose",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.insert",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/drive.metadata.readonly",
    ]) {
      expect(all).not.toContain(banned);
    }
  });

  it("asks Slack only for posting messages", () => {
    expect(SLACK_BOT_SCOPES).toEqual(["chat:write", "chat:write.public"]);
  });
});

describe("buildAuthUrl", () => {
  const url = new URL(
    buildAuthUrl(cfg, { scopes: ["openid", "email"], state: "the-state", codeChallenge: "the-challenge" }),
  );

  it("points at Google's authorization endpoint with the required parameters", () => {
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe(cfg.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(cfg.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email");
    expect(url.searchParams.get("state")).toBe("the-state");
  });

  it("asks for a refresh token and PKCE (S256)", () => {
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("code_challenge")).toBe("the-challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("never puts the client secret in the URL", () => {
    expect(url.toString()).not.toContain("GOCSPX");
  });
});

describe("exchangeCode", () => {
  it("posts the code and PKCE verifier to Google's token endpoint and returns a token bundle", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      json({ access_token: "a1", refresh_token: "r1", expires_in: 3599, scope: "openid email", token_type: "Bearer" }),
    );
    const client = createGoogleClient(cfg, fetchFn, () => now);
    const bundle = await client.exchangeCode("the-code", "the-verifier");

    expect(fetchFn.mock.calls[0]?.[0]).toBe("https://oauth2.googleapis.com/token");
    const body = bodyOf(fetchFn.mock.calls[0]!);
    expect(Object.fromEntries(body)).toMatchObject({
      grant_type: "authorization_code",
      code: "the-code",
      code_verifier: "the-verifier",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
    });
    expect(bundle).toEqual({
      accessToken: "a1",
      refreshToken: "r1",
      expiresAt: new Date(now.getTime() + 3_599_000).toISOString(),
      scope: "openid email",
    });
  });

  it("fails with a plain message and no secrets when Google rejects the code", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ error: "invalid_grant", error_description: "Bad code the-code" }, 400));
    const client = createGoogleClient(cfg, fetchFn, () => now);
    const err = await client.exchangeCode("the-code", "the-verifier").catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    const text = String((err as Error).message);
    expect(text).not.toContain("the-code");
    expect(text).not.toContain("GOCSPX");
  });
});

describe("refresh", () => {
  it("posts the refresh token and returns Google's raw token response", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ access_token: "a2", expires_in: 3599, token_type: "Bearer" }));
    const client = createGoogleClient(cfg, fetchFn, () => now);
    const out = await client.refresh("r1");
    expect(out).toMatchObject({ access_token: "a2" });
    const body = bodyOf(fetchFn.mock.calls[0]!);
    expect(Object.fromEntries(body)).toMatchObject({
      grant_type: "refresh_token",
      refresh_token: "r1",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    });
  });

  it("maps invalid_grant to a TokenRefreshError so the connection flips to needs_reconnect", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ error: "invalid_grant" }, 400));
    const client = createGoogleClient(cfg, fetchFn, () => now);
    await expect(client.refresh("r1")).rejects.toMatchObject({ name: "TokenRefreshError", code: "invalid_grant" });
  });

  it("treats server errors, other errors and network failures as temporary", async () => {
    for (const make of [
      () => Promise.resolve(json({ error: "backend_error" }, 503)),
      () => Promise.resolve(json({ error: "invalid_client" }, 401)),
      () => Promise.reject(new Error("network down r1")),
    ]) {
      const client = createGoogleClient(cfg, vi.fn().mockImplementation(make), () => now);
      const err = await client.refresh("r1").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(TokenRefreshError);
      expect((err as TokenRefreshError).code).toBe("temporary");
      expect(String((err as Error).message)).not.toContain("r1");
    }
  });
});

describe("revoke", () => {
  it("posts the token to Google's revoke endpoint", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await createGoogleClient(cfg, fetchFn, () => now).revoke("r1");
    expect(fetchFn.mock.calls[0]?.[0]).toBe("https://oauth2.googleapis.com/revoke");
    expect(bodyOf(fetchFn.mock.calls[0]!).get("token")).toBe("r1");
  });

  it("never throws, so disconnecting still works when Google is unreachable or the token is already dead", async () => {
    const down = createGoogleClient(cfg, vi.fn().mockRejectedValue(new Error("offline")), () => now);
    await expect(down.revoke("r1")).resolves.toBeUndefined();
    const dead = createGoogleClient(cfg, vi.fn().mockResolvedValue(json({ error: "invalid_token" }, 400)), () => now);
    await expect(dead.revoke("r1")).resolves.toBeUndefined();
  });
});
