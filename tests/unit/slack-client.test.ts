import { describe, expect, it, vi } from "vitest";
import { buildSlackAuthUrl, createSlackClient } from "@/server/connections/slack";

const cfg = {
  clientId: "1234.5678",
  clientSecret: "slack-super-secret",
  redirectUri: "https://example.ngrok.app/api/connections/slack/callback",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const form = (call: unknown[]) => new URLSearchParams(String((call[1] as RequestInit).body));

describe("buildSlackAuthUrl", () => {
  const url = new URL(buildSlackAuthUrl(cfg, { scopes: ["chat:write", "chat:write.public"], state: "the-state" }));

  it("points at Slack's v2 authorize endpoint with bot scopes, redirect and state", () => {
    expect(url.origin + url.pathname).toBe("https://slack.com/oauth/v2/authorize");
    expect(url.searchParams.get("client_id")).toBe(cfg.clientId);
    expect(url.searchParams.get("scope")).toBe("chat:write,chat:write.public");
    expect(url.searchParams.get("redirect_uri")).toBe(cfg.redirectUri);
    expect(url.searchParams.get("state")).toBe("the-state");
  });

  it("asks for no user scopes and never includes the secret", () => {
    expect(url.searchParams.has("user_scope")).toBe(false);
    expect(url.toString()).not.toContain("slack-super-secret");
  });
});

describe("exchangeCode", () => {
  const okBody = {
    ok: true,
    access_token: "xoxb-bot-token",
    token_type: "bot",
    scope: "chat:write,chat:write.public",
    bot_user_id: "U123",
    team: { id: "T123", name: "Test Workspace" },
  };

  it("posts the code to oauth.v2.access and returns the bot token and workspace", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json(okBody));
    const out = await createSlackClient(cfg, fetchFn).exchangeCode("the-code");
    expect(fetchFn.mock.calls[0]?.[0]).toBe("https://slack.com/api/oauth.v2.access");
    expect(Object.fromEntries(form(fetchFn.mock.calls[0]!))).toMatchObject({
      code: "the-code",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
    });
    expect(out).toEqual({
      accessToken: "xoxb-bot-token",
      scope: "chat:write,chat:write.public",
      accountLabel: "Test Workspace",
    });
  });

  it("fails without leaking secrets when Slack answers ok:false (HTTP is still 200)", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ ok: false, error: "invalid_code" }));
    const err = await createSlackClient(cfg, fetchFn).exchangeCode("the-code").catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(String((err as Error).message)).not.toContain("the-code");
    expect(String((err as Error).message)).not.toContain("slack-super-secret");
  });

  it("fails when the reply has no bot token, or Slack cannot be reached", async () => {
    await expect(
      createSlackClient(cfg, vi.fn().mockResolvedValue(json({ ok: true, team: { name: "x" } }))).exchangeCode("c"),
    ).rejects.toThrow();
    await expect(
      createSlackClient(cfg, vi.fn().mockRejectedValue(new Error("offline"))).exchangeCode("c"),
    ).rejects.toThrow(/Slack/);
  });
});

describe("revoke", () => {
  it("calls auth.revoke with the token as a bearer header", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ ok: true, revoked: true }));
    await createSlackClient(cfg, fetchFn).revoke("xoxb-bot-token");
    expect(fetchFn.mock.calls[0]?.[0]).toBe("https://slack.com/api/auth.revoke");
    const headers = (fetchFn.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer xoxb-bot-token");
  });

  it("never throws, so disconnecting works when Slack is unreachable or the token is already dead", async () => {
    await expect(createSlackClient(cfg, vi.fn().mockRejectedValue(new Error("x"))).revoke("t")).resolves.toBeUndefined();
    await expect(
      createSlackClient(cfg, vi.fn().mockResolvedValue(json({ ok: false, error: "invalid_auth" }))).revoke("t"),
    ).resolves.toBeUndefined();
  });
});
