import { describe, expect, it } from "vitest";
import { parseAuthCallback } from "@/server/access/auth-callback";

describe("auth callback", () => {
  it("accepts Supabase's default PKCE authorization code", () => {
    expect(parseAuthCallback(new URLSearchParams("code=abc123"))).toEqual({ kind: "code", code: "abc123" });
  });

  it("accepts token-hash magic-link templates", () => {
    expect(parseAuthCallback(new URLSearchParams("token_hash=hash123&type=email"))).toEqual({
      kind: "otp",
      tokenHash: "hash123",
      type: "email",
    });
  });

  it("rejects missing or unsupported callback parameters", () => {
    expect(parseAuthCallback(new URLSearchParams())).toBeNull();
    expect(parseAuthCallback(new URLSearchParams("token_hash=hash123&type=recovery"))).toBeNull();
  });
});
