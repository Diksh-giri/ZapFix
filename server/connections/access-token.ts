import { AppError } from "@/lib/errors";
import { bundleFromTokenResponse, isAccessTokenFresh, openStaticToken, openTokens, sealTokens } from "./token-bundle";

/**
 * getAccessToken (T9). Returns a usable access token, renewing it quietly when needed. A failed
 * renewal is what the debugger later explains as an "expired connection". Dependencies are passed
 * in so this runs in tests without a database or Google. Never log tokens or Google's responses.
 */
export class TokenRefreshError extends Error {
  constructor(readonly code: "invalid_grant" | "temporary") {
    super(code);
    this.name = "TokenRefreshError";
  }
}

export interface ConnectionStore {
  getConnection(id: string): Promise<{ id: string; userId: string; provider: string; status: string } | undefined>;
  loadSecret(connectionId: string): Promise<Buffer | undefined>;
  saveSecret(connectionId: string, ciphertext: Buffer, keyVersion: number): Promise<void>;
  markNeedsReconnect(connectionId: string, errorCode: string): Promise<void>;
}

export interface AccessTokenDeps {
  store: ConnectionStore;
  /** Calls the provider's token endpoint. Throws TokenRefreshError. Returns the raw token response. */
  refresh: (refreshToken: string) => Promise<unknown>;
  key: Buffer;
  keyVersion: number;
  now: () => Date;
  /** Renew this long before the token really expires. */
  skewMs: number;
}

export type AccessTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: "needs_reconnect" | "temporarily_unavailable"; code: string };

export async function getAccessToken(
  deps: AccessTokenDeps,
  connectionId: string,
  userId: string,
): Promise<AccessTokenResult> {
  const { store } = deps;
  const conn = await store.getConnection(connectionId);
  if (!conn || conn.userId !== userId) throw new AppError("not_found", "Connection not found.");
  if (conn.status !== "active") return { ok: false, reason: "needs_reconnect", code: conn.status };

  const blob = await store.loadSecret(connectionId);
  if (!blob) return reconnect(store, connectionId, "secret_missing");

  if (conn.provider === "slack") {
    try {
      return { ok: true, accessToken: openStaticToken(blob, deps.key).accessToken };
    } catch {
      return reconnect(store, connectionId, "secret_unreadable");
    }
  }

  let bundle;
  try {
    bundle = openTokens(blob, deps.key);
  } catch {
    return reconnect(store, connectionId, "secret_unreadable");
  }

  if (isAccessTokenFresh(bundle, deps.now(), deps.skewMs)) return { ok: true, accessToken: bundle.accessToken };

  try {
    const response = await deps.refresh(bundle.refreshToken);
    const renewed = bundleFromTokenResponse(response, deps.now(), bundle);
    await store.saveSecret(connectionId, sealTokens(renewed, deps.key), deps.keyVersion);
    return { ok: true, accessToken: renewed.accessToken };
  } catch (err) {
    if (err instanceof TokenRefreshError && err.code === "invalid_grant") {
      return reconnect(store, connectionId, "invalid_grant");
    }
    return { ok: false, reason: "temporarily_unavailable", code: "temporary" };
  }
}

async function reconnect(store: ConnectionStore, id: string, code: string): Promise<AccessTokenResult> {
  await store.markNeedsReconnect(id, code);
  return { ok: false, reason: "needs_reconnect", code };
}
