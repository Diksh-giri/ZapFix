import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { googleProvider, slackProvider } from "@/server/connections/providers";
import { requestedGoogleScopes, SLACK_BOT_SCOPES } from "@/server/connections/scopes";
import { openStaticToken, openTokens, sealStaticToken, sealTokens } from "@/server/connections/token-bundle";

const key = randomBytes(32);
const bundle = { accessToken: "a1", refreshToken: "r1", expiresAt: "2026-09-24T13:00:00.000Z", scope: "openid email" };

describe("googleProvider", () => {
  const client = {
    exchangeCode: vi.fn().mockResolvedValue({ bundle, accountLabel: "tester@example.com" }),
    refresh: vi.fn(),
    revoke: vi.fn().mockResolvedValue(undefined),
  };
  const provider = googleProvider(
    { clientId: "id", clientSecret: "secret", redirectUri: "http://localhost:3000/api/connections/google/callback" },
    client,
  );

  it("asks for every approved Google scope, with state and the PKCE challenge", () => {
    const url = new URL(provider.buildAuthUrl({ state: "s", codeChallenge: "c" }));
    expect(url.searchParams.get("scope")).toBe(requestedGoogleScopes().join(" "));
    expect(url.searchParams.get("state")).toBe("s");
    expect(url.searchParams.get("code_challenge")).toBe("c");
  });

  it("exchanges the code and seals a renewable token bundle", async () => {
    const out = await provider.exchange("code", "verifier");
    expect(client.exchangeCode).toHaveBeenCalledWith("code", "verifier");
    expect(out).toMatchObject({ scope: "openid email", accountLabel: "tester@example.com" });
    expect(openTokens(out.sealedSecret(key), key)).toEqual(bundle);
  });

  it("revokes the refresh token, and never throws on an unreadable secret", async () => {
    await provider.revoke(sealTokens(bundle, key), key);
    expect(client.revoke).toHaveBeenCalledWith("r1");
    await expect(provider.revoke(Buffer.from("garbage"), key)).resolves.toBeUndefined();
  });
});

describe("slackProvider", () => {
  const client = {
    exchangeCode: vi.fn().mockResolvedValue({ accessToken: "xoxb-1", scope: "chat:write", accountLabel: "Workspace" }),
    revoke: vi.fn().mockResolvedValue(undefined),
  };
  const provider = slackProvider(
    { clientId: "id", clientSecret: "secret", redirectUri: "https://x.example/api/connections/slack/callback" },
    client,
  );

  it("asks for the Slack bot scopes with state, and no PKCE", () => {
    const url = new URL(provider.buildAuthUrl({ state: "s", codeChallenge: "ignored" }));
    expect(url.searchParams.get("scope")).toBe(SLACK_BOT_SCOPES.join(","));
    expect(url.searchParams.get("state")).toBe("s");
    expect(url.searchParams.has("code_challenge")).toBe(false);
  });

  it("exchanges the code and seals a static bot token", async () => {
    const out = await provider.exchange("code", "verifier-is-unused");
    expect(client.exchangeCode).toHaveBeenCalledWith("code");
    expect(out).toMatchObject({ scope: "chat:write", accountLabel: "Workspace" });
    expect(openStaticToken(out.sealedSecret(key), key)).toEqual({ accessToken: "xoxb-1", scope: "chat:write" });
  });

  it("revokes the bot token, and never throws on an unreadable secret", async () => {
    await provider.revoke(sealStaticToken({ accessToken: "xoxb-1", scope: "" }, key), key);
    expect(client.revoke).toHaveBeenCalledWith("xoxb-1");
    await expect(provider.revoke(Buffer.from("garbage"), key)).resolves.toBeUndefined();
  });
});
