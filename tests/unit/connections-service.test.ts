import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createConnectionsService, type ConnectionsStore, type ProviderOAuth } from "@/server/connections/service";
import { deriveCookieKey, openTransaction } from "@/server/connections/oauth-state";
import { openTokens, sealTokens } from "@/server/connections/token-bundle";

const key = randomBytes(32);
const now = new Date("2026-09-24T12:00:00Z");
const USER = "user-1";

interface Row {
  id: string;
  userId: string;
  provider: string;
  status: string;
  scopes: string[];
  accountLabel: string | null;
  connectedAt: Date;
  lastErrorCode: string | null;
}
let rows: Row[];
let secrets: Map<string, { blob: Buffer; keyVersion: number }>;
let seq = 0;

const store: ConnectionsStore = {
  getConnection: async (id) => rows.find((r) => r.id === id),
  loadSecret: async (id) => secrets.get(id)?.blob,
  saveSecret: async (id, blob, keyVersion) => void secrets.set(id, { blob, keyVersion }),
  markNeedsReconnect: async (id, code) => {
    const r = rows.find((x) => x.id === id);
    if (r) Object.assign(r, { status: "needs_reconnect", lastErrorCode: code });
  },
  async upsertConnection(input) {
    let r = rows.find((x) => x.userId === input.userId && x.provider === input.provider);
    if (!r) {
      r = { id: `conn-${++seq}`, userId: input.userId, provider: input.provider } as Row;
      rows.push(r);
    }
    Object.assign(r, {
      status: "active",
      scopes: input.scopes,
      accountLabel: input.accountLabel,
      connectedAt: input.now,
      lastErrorCode: null,
    });
    return { id: r.id };
  },
  listConnections: async (userId) => rows.filter((r) => r.userId === userId),
  async deleteConnection(id, userId) {
    const i = rows.findIndex((r) => r.id === id && r.userId === userId);
    if (i < 0) return false;
    secrets.delete(id);
    rows.splice(i, 1);
    return true;
  },
};

const revoke = vi.fn(async () => {});
function fakeProvider(scope = "openid email cal"): ProviderOAuth {
  return {
    buildAuthUrl: ({ state, codeChallenge }) => `https://provider.example/auth?state=${state}&cc=${codeChallenge}`,
    exchange: async (code) => {
      if (code === "bad-code") throw new Error("Google did not accept the connection (HTTP 400).");
      return {
        sealedSecret: (k: Buffer) =>
          sealTokens({ accessToken: "a1", refreshToken: "r1", expiresAt: now.toISOString(), scope }, k),
        scope,
        accountLabel: "tester@example.com",
      };
    },
    revoke,
  };
}

function svc(opts: { secure?: boolean; provider?: ProviderOAuth } = {}) {
  return createConnectionsService({
    store,
    providerFor: () => opts.provider ?? fakeProvider(),
    tokenKey: key,
    keyVersion: 2,
    now: () => now,
    transactionTtlMs: 600_000,
    secureCookies: opts.secure ?? false,
  });
}

/** Run start, then hand the cookie and state back like a browser would. */
async function startAndGetCallback(s = svc(), userId = USER) {
  const started = await s.startConnect("google", userId, "http://localhost:3000");
  const state = new URL(started.authUrl).searchParams.get("state")!;
  return { started, state };
}

beforeEach(() => {
  rows = [];
  secrets = new Map();
  seq = 0;
  revoke.mockClear();
});

describe("startConnect", () => {
  it("returns the provider URL and a sealed httpOnly cookie that carries state and the PKCE verifier", async () => {
    const { started, state } = await startAndGetCallback();
    expect(started.authUrl).toContain(`state=${state}`);
    expect(started.cookie).toMatchObject({
      name: "zf_oauth_google",
      options: { httpOnly: true, sameSite: "lax", path: "/api/connections", maxAge: 600 },
    });
    const tx = openTransaction(started.cookie.value, deriveCookieKey(key), {
      state,
      userId: USER,
      provider: "google",
      now,
    });
    expect(started.cookie.value).not.toContain(tx.codeVerifier);
    expect(new URL(started.authUrl).searchParams.get("cc")).toBeTruthy();
  });

  it("marks the cookie secure only over https", async () => {
    expect((await svc({ secure: true }).startConnect("google", USER, "https://x.example")).cookie.options.secure).toBe(true);
    expect((await svc({ secure: false }).startConnect("google", USER, "http://localhost:3000")).cookie.options.secure).toBe(false);
  });

  it("never reuses state between two starts", async () => {
    const a = await startAndGetCallback();
    const b = await startAndGetCallback();
    expect(a.state).not.toBe(b.state);
  });
});

describe("completeConnect", () => {
  it("stores the connection and the encrypted tokens, then sends the tester back to /connections", async () => {
    const s = svc();
    const { started, state } = await startAndGetCallback(s);
    const out = await s.completeConnect("google", USER, "http://localhost:3000", { code: "good", state }, started.cookie.value);

    expect(out.redirectTo).toBe("/connections?connected=google");
    expect(out.clearCookie).toMatchObject({ name: "zf_oauth_google", options: { maxAge: 0 } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: USER,
      provider: "google",
      status: "active",
      accountLabel: "tester@example.com",
      lastErrorCode: null,
    });
    expect(rows[0]?.scopes).toEqual(["openid", "email", "cal"]);
    const saved = secrets.get(rows[0]!.id)!;
    expect(saved.keyVersion).toBe(2);
    expect(openTokens(saved.blob, key).refreshToken).toBe("r1");
    expect(saved.blob.toString("latin1")).not.toContain("r1");
  });

  it("reconnecting reactivates the existing connection instead of creating a second one", async () => {
    rows.push({
      id: "conn-old", userId: USER, provider: "google", status: "needs_reconnect", scopes: [],
      accountLabel: null, connectedAt: new Date("2026-09-01T00:00:00Z"), lastErrorCode: "invalid_grant",
    });
    const s = svc();
    const { started, state } = await startAndGetCallback(s);
    await s.completeConnect("google", USER, "http://localhost:3000", { code: "good", state }, started.cookie.value);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "conn-old", status: "active", lastErrorCode: null, connectedAt: now });
  });

  it("stores only the scopes the tester actually granted (partial consent)", async () => {
    const s = svc({ provider: fakeProvider("openid email") });
    const { started, state } = await startAndGetCallback(s);
    await s.completeConnect("google", USER, "http://localhost:3000", { code: "good", state }, started.cookie.value);
    expect(rows[0]?.scopes).toEqual(["openid", "email"]);
  });

  it("refuses a wrong state and stores nothing (CSRF)", async () => {
    const s = svc();
    const { started } = await startAndGetCallback(s);
    await expect(
      s.completeConnect("google", USER, "http://localhost:3000", { code: "good", state: "forged" }, started.cookie.value),
    ).rejects.toMatchObject({ code: "validation_failed" });
    expect(rows).toHaveLength(0);
    expect(secrets.size).toBe(0);
  });

  it("refuses a missing cookie and another user's cookie", async () => {
    const s = svc();
    const { started, state } = await startAndGetCallback(s);
    await expect(s.completeConnect("google", USER, "http://localhost:3000", { code: "good", state }, undefined)).rejects.toMatchObject({
      code: "validation_failed",
    });
    await expect(
      s.completeConnect("google", "user-2", "http://localhost:3000", { code: "good", state }, started.cookie.value),
    ).rejects.toThrow();
    expect(rows).toHaveLength(0);
  });

  it("goes back to /connections with a friendly reason when the tester clicks Cancel", async () => {
    const s = svc();
    const { started, state } = await startAndGetCallback(s);
    const out = await s.completeConnect("google", USER, "http://localhost:3000", { error: "access_denied", state }, started.cookie.value);
    expect(out.redirectTo).toBe("/connections?error=access_denied");
    expect(rows).toHaveLength(0);
  });

  it("does not store anything and shows a plain message when the provider rejects the code", async () => {
    const s = svc();
    const { started, state } = await startAndGetCallback(s);
    const out = await s.completeConnect("google", USER, "http://localhost:3000", { code: "bad-code", state }, started.cookie.value);
    expect(out.redirectTo).toBe("/connections?error=connect_failed");
    expect(rows).toHaveLength(0);
    expect(out.redirectTo).not.toContain("bad-code");
  });
});

describe("listConnections", () => {
  it("lists only the caller's connections, without any secret, with age and the Google 7-day note", async () => {
    const s = svc();
    const { started, state } = await startAndGetCallback(s);
    await s.completeConnect("google", USER, "http://localhost:3000", { code: "good", state }, started.cookie.value);
    rows.push({
      id: "other", userId: "user-2", provider: "slack", status: "active", scopes: [],
      accountLabel: "x", connectedAt: now, lastErrorCode: null,
    });

    const later = createConnectionsService({
      store, providerFor: () => fakeProvider(), tokenKey: key, keyVersion: 2,
      now: () => new Date(now.getTime() + 3 * 86_400_000), transactionTtlMs: 600_000, secureCookies: false,
    });
    const list = await later.listConnections(USER);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      provider: "google",
      status: "active",
      accountLabel: "tester@example.com",
      ageDays: 3,
      reconnectBy: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
    });
    const text = JSON.stringify(list);
    expect(text).not.toContain("r1");
    expect(text).not.toContain("ciphertext");
  });

  it("gives Slack no 7-day expiry", async () => {
    rows.push({
      id: "s1", userId: USER, provider: "slack", status: "active", scopes: [],
      accountLabel: "Workspace", connectedAt: now, lastErrorCode: null,
    });
    expect((await svc().listConnections(USER))[0]?.reconnectBy).toBeNull();
  });
});

describe("disconnect", () => {
  it("revokes at the provider, then deletes the connection and its secret", async () => {
    const s = svc();
    const { started, state } = await startAndGetCallback(s);
    await s.completeConnect("google", USER, "http://localhost:3000", { code: "good", state }, started.cookie.value);
    const id = rows[0]!.id;
    await s.disconnect(id, USER);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(0);
    expect(secrets.size).toBe(0);
  });

  it("hides another user's connection", async () => {
    rows.push({
      id: "c9", userId: "user-2", provider: "google", status: "active", scopes: [],
      accountLabel: null, connectedAt: now, lastErrorCode: null,
    });
    await expect(svc().disconnect("c9", USER)).rejects.toMatchObject({ code: "not_found" });
    expect(rows).toHaveLength(1);
    expect(revoke).not.toHaveBeenCalled();
  });

  it("still deletes when the secret is missing or unreadable", async () => {
    rows.push({
      id: "c1", userId: USER, provider: "google", status: "active", scopes: [],
      accountLabel: null, connectedAt: now, lastErrorCode: null,
    });
    await svc().disconnect("c1", USER);
    expect(rows).toHaveLength(0);
    expect(revoke).not.toHaveBeenCalled();
  });
});
