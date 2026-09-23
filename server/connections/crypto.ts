import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Token encryption (Decision #020). AES-256-GCM. Layout: iv(12) | authTag(16) | ciphertext.
 * Pure functions: the key is passed in. Reading the key from env happens in secrets.ts
 * (server only). REVIEW WITH THE SECURITY PLAN (TDD section 19) before real tokens are stored.
 */
const IV_LEN = 12;
const TAG_LEN = 16;

export function parseKey(base64: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  return key;
}

export function encryptToken(plaintext: string, key: Buffer): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

export function decryptToken(blob: Buffer, key: Buffer): string {
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
