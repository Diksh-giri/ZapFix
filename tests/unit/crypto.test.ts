import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken, parseKey } from "@/server/connections/crypto";

describe("token crypto", () => {
  const key = randomBytes(32);

  it("round-trips and never stores plaintext", () => {
    const blob = encryptToken("ya29.secret-token", key);
    expect(blob.toString("utf8")).not.toContain("secret-token");
    expect(decryptToken(blob, key)).toBe("ya29.secret-token");
  });

  it("uses a fresh IV each time", () => {
    expect(encryptToken("x", key).equals(encryptToken("x", key))).toBe(false);
  });

  it("fails with the wrong key or tampered data", () => {
    const blob = encryptToken("x", key);
    expect(() => decryptToken(blob, randomBytes(32))).toThrow();
    blob[blob.length - 1] = (blob[blob.length - 1]! ^ 1) & 0xff;
    expect(() => decryptToken(blob, key)).toThrow();
  });

  it("requires a 32-byte key", () => {
    expect(() => parseKey(Buffer.from("short").toString("base64"))).toThrow();
    expect(parseKey(key.toString("base64")).length).toBe(32);
  });
});
