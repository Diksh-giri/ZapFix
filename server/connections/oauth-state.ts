import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { PROVIDERS, type Provider } from "@/lib/types";
import { decryptToken, encryptToken } from "./crypto";

/**
 * OAuth "state" + PKCE for the connect flow. The transaction is sealed into a short-lived httpOnly
 * cookie at /start and opened at /callback, so no database table is needed. The verifier is only
 * ever readable on the server. Pure functions: the key is passed in.
 */
const TransactionSchema = z.object({
  state: z.string().min(32),
  codeVerifier: z.string().min(43).max(128),
  userId: z.string().min(1),
  provider: z.enum(PROVIDERS),
  expiresAt: z.string(),
});
export type OAuthTransaction = z.infer<typeof TransactionSchema>;

const invalid = () => new AppError("validation_failed", "This connection attempt is not valid. Please start again.");

export function createOAuthTransaction(input: {
  userId: string;
  provider: Provider;
  now: Date;
  ttlMs: number;
}): { transaction: OAuthTransaction; codeChallenge: string } {
  const codeVerifier = randomBytes(48).toString("base64url");
  const transaction: OAuthTransaction = {
    state: randomBytes(32).toString("base64url"),
    codeVerifier,
    userId: input.userId,
    provider: input.provider,
    expiresAt: new Date(input.now.getTime() + input.ttlMs).toISOString(),
  };
  return { transaction, codeChallenge: createHash("sha256").update(codeVerifier).digest("base64url") };
}

/** A separate key for cookies, derived from the token key, so the token key itself never seals cookies. */
export function deriveCookieKey(tokenKey: Buffer): Buffer {
  return createHmac("sha256", tokenKey).update("zapfix:oauth-state-cookie:v1").digest();
}

export function sealTransaction(tx: OAuthTransaction, key: Buffer): string {
  return encryptToken(JSON.stringify(tx), key).toString("base64url");
}

export function openTransaction(
  sealed: string,
  key: Buffer,
  expected: { state: string; userId: string; provider: Provider; now: Date },
): OAuthTransaction {
  let tx: OAuthTransaction;
  try {
    tx = TransactionSchema.parse(JSON.parse(decryptToken(Buffer.from(sealed, "base64url"), key)));
  } catch {
    throw invalid();
  }

  const a = Buffer.from(tx.state);
  const b = Buffer.from(expected.state);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError("validation_failed", "The connection request did not match (state). Please start again.");
  }
  if (tx.userId !== expected.userId || tx.provider !== expected.provider) throw invalid();
  if (new Date(tx.expiresAt).getTime() < expected.now.getTime()) {
    throw new AppError("validation_failed", "This connection attempt expired. Please start again.");
  }
  return tx;
}
