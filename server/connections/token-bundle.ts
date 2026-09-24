import { z } from "zod";
import { decryptToken, encryptToken } from "./crypto";

/**
 * What we keep per connection (one encrypted blob in private.connection_secrets.ciphertext).
 * Pure functions: the key is passed in. Never log a bundle or a token response.
 */
export const TokenBundleSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.string(),
  scope: z.string(),
});
export type TokenBundle = z.infer<typeof TokenBundleSchema>;

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});

/** Slack bot tokens do not expire and have no refresh token, so they are stored as a plain token + scope. */
export const StaticTokenSchema = z.object({ accessToken: z.string().min(1), scope: z.string() });
export type StaticToken = z.infer<typeof StaticTokenSchema>;

export function sealStaticToken(token: StaticToken, key: Buffer): Buffer {
  return encryptToken(JSON.stringify(token), key);
}

export function openStaticToken(blob: Buffer, key: Buffer): StaticToken {
  return StaticTokenSchema.parse(JSON.parse(decryptToken(blob, key)));
}

export function sealTokens(bundle: TokenBundle, key: Buffer): Buffer {
  return encryptToken(JSON.stringify(bundle), key);
}

export function openTokens(blob: Buffer, key: Buffer): TokenBundle {
  return TokenBundleSchema.parse(JSON.parse(decryptToken(blob, key)));
}

export function isAccessTokenFresh(bundle: TokenBundle, now: Date, skewMs: number): boolean {
  return new Date(bundle.expiresAt).getTime() - skewMs > now.getTime();
}

/**
 * Turn the provider's token response into a bundle. A renewal response usually has no refresh
 * token and may omit scope, so the previous values are kept.
 */
export function bundleFromTokenResponse(
  response: unknown,
  now: Date,
  previous?: Pick<TokenBundle, "refreshToken" | "scope">,
): TokenBundle {
  const parsed = TokenResponseSchema.safeParse(response);
  if (!parsed.success) throw new Error("The token response was not in the expected shape.");
  const r = parsed.data;
  const refreshToken = r.refresh_token ?? previous?.refreshToken;
  if (!refreshToken) throw new Error("The token response has no refresh token.");
  return {
    accessToken: r.access_token,
    refreshToken,
    expiresAt: new Date(now.getTime() + r.expires_in * 1000).toISOString(),
    scope: r.scope ?? previous?.scope ?? "",
  };
}

/** Scopes we need that the tester did not grant (Google lets people untick permissions). */
export function missingScopes(required: string[], grantedScope: string): string[] {
  const granted = new Set(grantedScope.split(/\s+/).filter(Boolean));
  return required.filter((s) => !granted.has(s));
}
