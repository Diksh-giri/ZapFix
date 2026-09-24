import { AppError } from "@/lib/errors";
import type { Provider } from "@/lib/types";
import type { ConnectionStore } from "./access-token";
import { createOAuthTransaction, deriveCookieKey, openTransaction, sealTransaction } from "./oauth-state";

/**
 * The connect / list / disconnect logic behind the /api/connections routes (T9).
 * Everything external (database, Google, Slack, clock) is passed in, so it runs in unit tests.
 * Never log codes, tokens, cookies or provider responses.
 */
export interface ConnectionRow {
  id: string;
  userId: string;
  provider: string;
  status: string;
  scopes: string[];
  accountLabel: string | null;
  connectedAt: Date;
  lastErrorCode: string | null;
}

export interface ConnectionsStore extends ConnectionStore {
  upsertConnection(input: {
    userId: string;
    provider: Provider;
    scopes: string[];
    accountLabel: string | null;
    now: Date;
  }): Promise<{ id: string }>;
  listConnections(userId: string): Promise<ConnectionRow[]>;
  /** Deletes the connection and (by cascade) its secret. False if it is not this user's. */
  deleteConnection(id: string, userId: string): Promise<boolean>;
}

export interface ProviderOAuth {
  buildAuthUrl(input: { state: string; codeChallenge: string }): string;
  exchange(
    code: string,
    codeVerifier: string,
  ): Promise<{ sealedSecret: (key: Buffer) => Buffer; scope: string; accountLabel: string | null }>;
  /** Best effort. Must never throw. */
  revoke(secret: Buffer, key: Buffer): Promise<void>;
}

export interface ConnectionsDeps {
  store: ConnectionsStore;
  providerFor: (provider: Provider, origin: string) => ProviderOAuth;
  tokenKey: Buffer;
  keyVersion: number;
  now: () => Date;
  transactionTtlMs: number;
  secureCookies: boolean;
}

export interface CookieToSet {
  name: string;
  value: string;
  options: { httpOnly: true; sameSite: "lax"; path: string; maxAge: number; secure: boolean };
}

const DAY_MS = 86_400_000;
const GOOGLE_TESTING_MODE_DAYS = 7;
const cookieName = (p: Provider) => `zf_oauth_${p}`;

export function createConnectionsService(deps: ConnectionsDeps) {
  const cookieKey = deriveCookieKey(deps.tokenKey);
  const cookie = (provider: Provider, value: string, maxAge: number): CookieToSet => ({
    name: cookieName(provider),
    value,
    options: { httpOnly: true, sameSite: "lax", path: "/api/connections", maxAge, secure: deps.secureCookies },
  });

  return {
    async startConnect(provider: Provider, userId: string, origin: string) {
      const { transaction, codeChallenge } = createOAuthTransaction({
        userId,
        provider,
        now: deps.now(),
        ttlMs: deps.transactionTtlMs,
      });
      const authUrl = deps.providerFor(provider, origin).buildAuthUrl({ state: transaction.state, codeChallenge });
      return {
        authUrl,
        cookie: cookie(provider, sealTransaction(transaction, cookieKey), Math.round(deps.transactionTtlMs / 1000)),
      };
    },

    async completeConnect(
      provider: Provider,
      userId: string,
      origin: string,
      query: { code?: string; state?: string; error?: string },
      sealedCookie: string | undefined,
    ): Promise<{ redirectTo: string; clearCookie: CookieToSet }> {
      if (!sealedCookie || !query.state) {
        throw new AppError("validation_failed", "This connection attempt is not valid. Please start again.");
      }
      const tx = openTransaction(sealedCookie, cookieKey, { state: query.state, userId, provider, now: deps.now() });
      const done = (redirectTo: string) => ({ redirectTo, clearCookie: cookie(provider, "", 0) });

      if (query.error) return done(`/connections?error=${query.error === "access_denied" ? "access_denied" : "connect_failed"}`);
      if (!query.code) return done("/connections?error=connect_failed");

      let result;
      try {
        result = await deps.providerFor(provider, origin).exchange(query.code, tx.codeVerifier);
      } catch {
        return done("/connections?error=connect_failed");
      }

      const { id } = await deps.store.upsertConnection({
        userId,
        provider,
        scopes: result.scope.split(/[\s,]+/).filter(Boolean),
        accountLabel: result.accountLabel,
        now: deps.now(),
      });
      await deps.store.saveSecret(id, result.sealedSecret(deps.tokenKey), deps.keyVersion);
      return done(`/connections?connected=${provider}`);
    },

    async listConnections(userId: string) {
      const now = deps.now().getTime();
      return (await deps.store.listConnections(userId)).map((c) => ({
        id: c.id,
        provider: c.provider,
        status: c.status,
        scopes: c.scopes,
        accountLabel: c.accountLabel,
        connectedAt: c.connectedAt.toISOString(),
        lastErrorCode: c.lastErrorCode,
        ageDays: Math.floor((now - c.connectedAt.getTime()) / DAY_MS),
        // Google apps in Testing mode lose their authorization 7 days after consent.
        reconnectBy:
          c.provider === "google"
            ? new Date(c.connectedAt.getTime() + GOOGLE_TESTING_MODE_DAYS * DAY_MS).toISOString()
            : null,
      }));
    },

    async disconnect(connectionId: string, userId: string): Promise<void> {
      const conn = await deps.store.getConnection(connectionId);
      if (!conn || conn.userId !== userId) throw new AppError("not_found", "Connection not found.");

      const secret = await deps.store.loadSecret(connectionId);
      if (secret) {
        try {
          await deps.providerFor(conn.provider as Provider, "").revoke(secret, deps.tokenKey);
        } catch {
          // disconnecting must still work if the provider cannot be reached
        }
      }
      if (!(await deps.store.deleteConnection(connectionId, userId))) {
        throw new AppError("not_found", "Connection not found.");
      }
    },
  };
}
