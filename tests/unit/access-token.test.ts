import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAccessToken,
  TokenRefreshError,
  type ConnectionStore,
} from "@/server/connections/access-token";
import { openTokens, sealStaticToken, sealTokens, type TokenBundle } from "@/server/connections/token-bundle";

const key = randomBytes(32);
const now = new Date("2026-09-24T12:00:00Z");
const SKEW = 60_000;
const soon = (ms: number) => new Date(now.getTime() + ms).toISOString();

const stored: TokenBundle = {
  accessToken: "old-access",
  refreshToken: "the-refresh-token",
  expiresAt: soon(3_600_000),
  scope: "openid email",
};

let status: string;
let secret: Buffer | undefined;
let saved: { blob: Buffer; keyVersion: number } | undefined;
let marked: { id: string; code: string } | undefined;
let owner = "user-1";
let exists = true;
let provider = "google";
const getMarked = () => marked;

const store: ConnectionStore = {
  getConnection: async (id) => (exists ? { id, userId: owner, provider, status } : undefined),
  loadSecret: async () => secret,
  saveSecret: async (_id, blob, keyVersion) => {
    saved = { blob, keyVersion };
    secret = blob;
  },
  markNeedsReconnect: async (id, code) => {
    marked = { id, code };
    status = "needs_reconnect";
  },
};

function deps(refresh = vi.fn()) {
  return { store, refresh, key, keyVersion: 3, now: () => now, skewMs: SKEW };
}

beforeEach(() => {
  status = "active";
  owner = "user-1";
  exists = true;
  provider = "google";
  saved = undefined;
  marked = undefined;
  secret = sealTokens(stored, key);
});

describe("getAccessToken", () => {
  it("returns the stored token when it is still fresh, without calling Google", async () => {
    const d = deps();
    const r = await getAccessToken(d, "conn-1", "user-1");
    expect(r).toEqual({ ok: true, accessToken: "old-access" });
    expect(d.refresh).not.toHaveBeenCalled();
    expect(saved).toBeUndefined();
  });

  it("renews a stale token with the stored refresh token and saves it encrypted", async () => {
    secret = sealTokens({ ...stored, expiresAt: soon(10_000) }, key);
    const refresh = vi.fn().mockResolvedValue({ access_token: "new-access", expires_in: 3599, token_type: "Bearer" });
    const r = await getAccessToken(deps(refresh), "conn-1", "user-1");
    expect(refresh).toHaveBeenCalledWith("the-refresh-token");
    expect(r).toEqual({ ok: true, accessToken: "new-access" });
    expect(saved?.keyVersion).toBe(3);
    const reopened = openTokens(saved!.blob, key);
    expect(reopened).toMatchObject({ accessToken: "new-access", refreshToken: "the-refresh-token", scope: "openid email" });
    expect(saved!.blob.toString("latin1")).not.toContain("new-access");
  });

  it("flips the connection to needs_reconnect when Google says invalid_grant", async () => {
    secret = sealTokens({ ...stored, expiresAt: soon(-1000) }, key);
    const refresh = vi.fn().mockRejectedValue(new TokenRefreshError("invalid_grant"));
    const r = await getAccessToken(deps(refresh), "conn-1", "user-1");
    expect(r).toEqual({ ok: false, reason: "needs_reconnect", code: "invalid_grant" });
    expect(marked).toEqual({ id: "conn-1", code: "invalid_grant" });
    expect(saved).toBeUndefined();
  });

  it("does not blame the tester for a temporary Google or network problem", async () => {
    secret = sealTokens({ ...stored, expiresAt: soon(-1000) }, key);
    const refresh = vi.fn().mockRejectedValue(new TokenRefreshError("temporary"));
    const r = await getAccessToken(deps(refresh), "conn-1", "user-1");
    expect(r).toEqual({ ok: false, reason: "temporarily_unavailable", code: "temporary" });
    expect(marked).toBeUndefined();
    expect(status).toBe("active");
  });

  it("treats an unexpected refresh failure as temporary and never leaks its message", async () => {
    secret = sealTokens({ ...stored, expiresAt: soon(-1000) }, key);
    const refresh = vi.fn().mockRejectedValue(new Error("boom the-refresh-token"));
    const r = await getAccessToken(deps(refresh), "conn-1", "user-1");
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("the-refresh-token");
    expect(marked).toBeUndefined();
  });

  it("does not call Google for a connection already marked needs_reconnect or revoked", async () => {
    for (const s of ["needs_reconnect", "revoked"]) {
      status = s;
      const d = deps();
      const r = await getAccessToken(d, "conn-1", "user-1");
      expect(r).toMatchObject({ ok: false, reason: "needs_reconnect" });
      expect(d.refresh).not.toHaveBeenCalled();
    }
  });

  it("hides another user's connection and unknown ids", async () => {
    owner = "user-2";
    await expect(getAccessToken(deps(), "conn-1", "user-1")).rejects.toMatchObject({ code: "not_found" });
    exists = false;
    await expect(getAccessToken(deps(), "conn-1", "user-1")).rejects.toMatchObject({ code: "not_found" });
  });

  it("asks the tester to reconnect when the secret is missing or unreadable", async () => {
    secret = undefined;
    expect(await getAccessToken(deps(), "conn-1", "user-1")).toMatchObject({ ok: false, reason: "needs_reconnect" });
    expect(getMarked()?.code).toBe("secret_missing");

    status = "active";
    marked = undefined;
    secret = sealTokens(stored, randomBytes(32));
    expect(await getAccessToken(deps(), "conn-1", "user-1")).toMatchObject({ ok: false, reason: "needs_reconnect" });
    expect(getMarked()?.code).toBe("secret_unreadable");
  });

  it("never puts a token in a failure result", async () => {
    secret = sealTokens({ ...stored, expiresAt: soon(-1000) }, key);
    const refresh = vi.fn().mockRejectedValue(new TokenRefreshError("invalid_grant"));
    const r = await getAccessToken(deps(refresh), "conn-1", "user-1");
    const text = JSON.stringify(r);
    expect(text).not.toContain("old-access");
    expect(text).not.toContain("the-refresh-token");
  });
});

describe("getAccessToken for Slack (bot tokens do not expire or renew)", () => {
  beforeEach(() => {
    provider = "slack";
    secret = sealStaticToken({ accessToken: "xoxb-the-bot-token", scope: "chat:write" }, key);
  });

  it("returns the stored bot token without ever calling a refresh", async () => {
    const d = deps();
    expect(await getAccessToken(d, "conn-1", "user-1")).toEqual({ ok: true, accessToken: "xoxb-the-bot-token" });
    expect(d.refresh).not.toHaveBeenCalled();
    expect(saved).toBeUndefined();
  });

  it("asks the tester to reconnect when the Slack secret is missing or unreadable", async () => {
    secret = undefined;
    expect(await getAccessToken(deps(), "conn-1", "user-1")).toMatchObject({ ok: false, reason: "needs_reconnect" });
    status = "active";
    secret = sealStaticToken({ accessToken: "x", scope: "" }, randomBytes(32));
    expect(await getAccessToken(deps(), "conn-1", "user-1")).toMatchObject({ ok: false, reason: "needs_reconnect" });
  });

  it("does not use a token for a needs_reconnect Slack connection", async () => {
    status = "needs_reconnect";
    expect(await getAccessToken(deps(), "conn-1", "user-1")).toMatchObject({ ok: false, reason: "needs_reconnect" });
  });
});
