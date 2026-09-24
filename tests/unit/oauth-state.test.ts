import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createOAuthTransaction,
  deriveCookieKey,
  openTransaction,
  sealTransaction,
} from "@/server/connections/oauth-state";

const key = randomBytes(32);
const now = new Date("2026-09-24T12:00:00Z");
const TTL = 10 * 60_000;
const b64url = /^[A-Za-z0-9_-]+$/;

function fresh(overrides: Partial<Parameters<typeof createOAuthTransaction>[0]> = {}) {
  return createOAuthTransaction({ userId: "user-1", provider: "google", now, ttlMs: TTL, ...overrides });
}

describe("createOAuthTransaction (state + PKCE)", () => {
  it("makes an unguessable url-safe state and a valid PKCE pair", () => {
    const { transaction, codeChallenge } = fresh();
    expect(transaction.state.length).toBeGreaterThanOrEqual(32);
    expect(transaction.state).toMatch(b64url);
    expect(transaction.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(transaction.codeVerifier.length).toBeLessThanOrEqual(128);
    expect(transaction.codeVerifier).toMatch(b64url);
    const expected = createHash("sha256").update(transaction.codeVerifier).digest("base64url");
    expect(codeChallenge).toBe(expected);
    expect(codeChallenge).not.toContain("=");
  });

  it("never reuses a state or verifier", () => {
    const a = fresh().transaction;
    const b = fresh().transaction;
    expect(a.state).not.toBe(b.state);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });

  it("binds the transaction to the user, provider and an expiry", () => {
    const { transaction } = fresh();
    expect(transaction).toMatchObject({ userId: "user-1", provider: "google" });
    expect(new Date(transaction.expiresAt).getTime()).toBe(now.getTime() + TTL);
  });
});

describe("sealTransaction / openTransaction", () => {
  const expectFor = (state: string, over = {}) => ({ state, userId: "user-1", provider: "google" as const, now, ...over });

  it("round-trips when state, user and provider match", () => {
    const { transaction } = fresh();
    const sealed = sealTransaction(transaction, key);
    expect(openTransaction(sealed, key, expectFor(transaction.state))).toEqual(transaction);
  });

  it("hides the verifier and state inside the cookie value", () => {
    const { transaction } = fresh();
    const sealed = sealTransaction(transaction, key);
    expect(sealed).toMatch(b64url);
    expect(sealed).not.toContain(transaction.codeVerifier);
    expect(sealed).not.toContain(transaction.state);
    expect(Buffer.from(sealed, "base64url").toString("utf8")).not.toContain(transaction.codeVerifier);
  });

  it("refuses a callback whose state does not match (CSRF)", () => {
    const { transaction } = fresh();
    const sealed = sealTransaction(transaction, key);
    expect(() => openTransaction(sealed, key, expectFor("some-other-state"))).toThrow(/state/i);
  });

  it("refuses a callback for a different signed-in user", () => {
    const { transaction } = fresh();
    const sealed = sealTransaction(transaction, key);
    expect(() => openTransaction(sealed, key, expectFor(transaction.state, { userId: "user-2" }))).toThrow();
  });

  it("refuses a callback for a different provider", () => {
    const { transaction } = fresh();
    const sealed = sealTransaction(transaction, key);
    expect(() => openTransaction(sealed, key, expectFor(transaction.state, { provider: "slack" }))).toThrow();
  });

  it("refuses an expired transaction", () => {
    const { transaction } = fresh();
    const sealed = sealTransaction(transaction, key);
    const later = new Date(now.getTime() + TTL + 1);
    expect(() => openTransaction(sealed, key, expectFor(transaction.state, { now: later }))).toThrow(/expired/i);
  });

  it("refuses a tampered cookie", () => {
    const { transaction } = fresh();
    const sealed = sealTransaction(transaction, key);
    const buf = Buffer.from(sealed, "base64url");
    buf[buf.length - 1] = (buf[buf.length - 1] ?? 0) ^ 1;
    expect(() => openTransaction(buf.toString("base64url"), key, expectFor(transaction.state))).toThrow();
  });

  it("refuses garbage and a cookie sealed with another key", () => {
    const { transaction } = fresh();
    expect(() => openTransaction("not-a-cookie", key, expectFor(transaction.state))).toThrow();
    const sealed = sealTransaction(transaction, randomBytes(32));
    expect(() => openTransaction(sealed, key, expectFor(transaction.state))).toThrow();
  });
});

describe("deriveCookieKey", () => {
  it("derives a different 32-byte key so the token key is never used to seal cookies", () => {
    const derived = deriveCookieKey(key);
    expect(derived).toHaveLength(32);
    expect(derived.equals(key)).toBe(false);
    expect(deriveCookieKey(key).equals(derived)).toBe(true);
  });
});
