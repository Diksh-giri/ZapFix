import { describe, expect, it } from "vitest";
import { expiredCookie, readCookie, serializeCookie } from "@/server/connections/cookies";

const base = { name: "zf_oauth_google", value: "abc_DEF-123", options: { httpOnly: true, sameSite: "lax", path: "/api/connections", maxAge: 600, secure: false } } as const;

describe("serializeCookie", () => {
  it("writes an httpOnly, SameSite=Lax cookie scoped to the connections path", () => {
    const c = serializeCookie(base);
    expect(c).toContain("zf_oauth_google=abc_DEF-123");
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("Path=/api/connections");
    expect(c).toContain("Max-Age=600");
  });

  it("adds Secure only when asked", () => {
    expect(serializeCookie(base)).not.toContain("Secure");
    expect(serializeCookie({ ...base, options: { ...base.options, secure: true } })).toContain("Secure");
  });

  it("clears a cookie with Max-Age=0", () => {
    expect(serializeCookie({ ...base, value: "", options: { ...base.options, maxAge: 0 } })).toContain("Max-Age=0");
  });
});

describe("readCookie", () => {
  it("finds a cookie among several", () => {
    expect(readCookie("a=1; zf_oauth_google=abc; b=2", "zf_oauth_google")).toBe("abc");
  });

  it("returns undefined when absent or when there is no header", () => {
    expect(readCookie("a=1", "zf_oauth_google")).toBeUndefined();
    expect(readCookie(null, "zf_oauth_google")).toBeUndefined();
    expect(readCookie("zf_oauth_google=", "zf_oauth_google")).toBeUndefined();
  });

  it("does not match a cookie whose name only ends the same way", () => {
    expect(readCookie("x_zf_oauth_google=evil", "zf_oauth_google")).toBeUndefined();
  });
});

describe("expiredCookie", () => {
  it("expires the connect cookie for that provider on the same path", () => {
    const c = serializeCookie(expiredCookie("slack", true));
    expect(c).toContain("zf_oauth_slack=;");
    expect(c).toContain("Max-Age=0");
    expect(c).toContain("Path=/api/connections");
    expect(c).toContain("Secure");
  });
});
