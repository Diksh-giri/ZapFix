import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  bundleFromTokenResponse,
  isAccessTokenFresh,
  missingScopes,
  openStaticToken,
  openTokens,
  sealStaticToken,
  sealTokens,
  type TokenBundle,
} from "@/server/connections/token-bundle";

const key = randomBytes(32);
const now = new Date("2026-09-24T12:00:00Z");

const bundle: TokenBundle = {
  accessToken: "ya29.access-token-value",
  refreshToken: "1//refresh-token-value",
  expiresAt: new Date(now.getTime() + 3_600_000).toISOString(),
  scope: "openid email https://www.googleapis.com/auth/calendar.events.owned",
};

describe("sealTokens / openTokens", () => {
  it("round-trips a bundle", () => {
    expect(openTokens(sealTokens(bundle, key), key)).toEqual(bundle);
  });

  it("never contains the token text in the stored bytes", () => {
    const blob = sealTokens(bundle, key);
    const raw = blob.toString("latin1") + blob.toString("utf8") + blob.toString("base64");
    expect(raw).not.toContain("ya29.access-token-value");
    expect(raw).not.toContain("1//refresh-token-value");
  });

  it("uses a fresh random iv each time", () => {
    expect(sealTokens(bundle, key).equals(sealTokens(bundle, key))).toBe(false);
  });

  it("refuses the wrong key and tampered bytes", () => {
    const blob = sealTokens(bundle, key);
    expect(() => openTokens(blob, randomBytes(32))).toThrow();
    const bad = Buffer.from(blob);
    bad[bad.length - 1] = (bad[bad.length - 1] ?? 0) ^ 1;
    expect(() => openTokens(bad, key)).toThrow();
  });

  it("refuses a decrypted value that is not a token bundle", () => {
    // encrypted correctly but with the wrong shape
    const wrong = sealTokens({ ...bundle, refreshToken: undefined as unknown as string }, key);
    expect(() => openTokens(wrong, key)).toThrow();
  });
});

describe("isAccessTokenFresh", () => {
  it("is fresh well before expiry and stale inside the safety margin", () => {
    expect(isAccessTokenFresh(bundle, now, 60_000)).toBe(true);
    const nearly = { ...bundle, expiresAt: new Date(now.getTime() + 30_000).toISOString() };
    expect(isAccessTokenFresh(nearly, now, 60_000)).toBe(false);
    const past = { ...bundle, expiresAt: new Date(now.getTime() - 1).toISOString() };
    expect(isAccessTokenFresh(past, now, 60_000)).toBe(false);
  });
});

describe("bundleFromTokenResponse", () => {
  it("builds a bundle from Google's first token response", () => {
    const b = bundleFromTokenResponse(
      { access_token: "a1", refresh_token: "r1", expires_in: 3599, scope: "openid email", token_type: "Bearer" },
      now,
    );
    expect(b).toEqual({
      accessToken: "a1",
      refreshToken: "r1",
      expiresAt: new Date(now.getTime() + 3_599_000).toISOString(),
      scope: "openid email",
    });
  });

  it("keeps the previous refresh token when a renewal response has none", () => {
    const b = bundleFromTokenResponse(
      { access_token: "a2", expires_in: 3599, scope: "openid email", token_type: "Bearer" },
      now,
      { refreshToken: "r-old", scope: "openid email" },
    );
    expect(b.refreshToken).toBe("r-old");
    expect(b.accessToken).toBe("a2");
  });

  it("keeps the previous scope when a renewal response omits it", () => {
    const b = bundleFromTokenResponse(
      { access_token: "a2", expires_in: 3599, token_type: "Bearer" },
      now,
      { refreshToken: "r-old", scope: "openid email" },
    );
    expect(b.scope).toBe("openid email");
  });

  it("refuses a first response with no refresh token", () => {
    expect(() =>
      bundleFromTokenResponse({ access_token: "a1", expires_in: 3599, scope: "openid", token_type: "Bearer" }, now),
    ).toThrow(/refresh/i);
  });

  it("refuses a response that is not a token response", () => {
    expect(() => bundleFromTokenResponse({ error: "invalid_grant" }, now)).toThrow();
    expect(() => bundleFromTokenResponse(null, now)).toThrow();
  });
});

describe("missingScopes (partial consent)", () => {
  const need = ["https://www.googleapis.com/auth/calendar.events.owned", "https://www.googleapis.com/auth/spreadsheets"];

  it("returns nothing when every required scope was granted", () => {
    const granted = "openid email https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/calendar.events.owned";
    expect(missingScopes(need, granted)).toEqual([]);
  });

  it("lists the scopes the tester unticked", () => {
    expect(missingScopes(need, "openid email https://www.googleapis.com/auth/calendar.events.owned")).toEqual([
      "https://www.googleapis.com/auth/spreadsheets",
    ]);
  });

  it("treats an empty grant as everything missing and ignores extra spaces", () => {
    expect(missingScopes(need, "")).toEqual(need);
    expect(missingScopes(need, "  https://www.googleapis.com/auth/spreadsheets   ")).toEqual([need[0]]);
  });
});

describe("static tokens (Slack bot tokens do not expire or renew)", () => {
  const t = { accessToken: "xoxb-the-bot-token", scope: "chat:write" };

  it("round-trips and never stores the token in plain text", () => {
    const blob = sealStaticToken(t, key);
    expect(openStaticToken(blob, key)).toEqual(t);
    expect(blob.toString("latin1") + blob.toString("base64")).not.toContain("xoxb-the-bot-token");
  });

  it("refuses the wrong key", () => {
    expect(() => openStaticToken(sealStaticToken(t, key), randomBytes(32))).toThrow();
  });
});
