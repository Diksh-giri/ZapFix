import "server-only";
import { db } from "@/db/client";
import { getAdapter } from "@/server/adapters/registry";
import { auditStore, enforceRateLimit } from "@/server/audit";
import { recordEvent } from "@/server/audit/events";
import { getAccessToken, TokenRefreshError } from "@/server/connections/access-token";
import { createDrizzleConnectionsStore } from "@/server/connections/drizzle-store";
import { createGoogleClient } from "@/server/connections/google";
import { getTokenKey } from "@/server/connections/secrets";
import { createRunEngine } from "./orchestrator";
import { createDrizzleRunStore } from "./drizzle-store";

/** Wires the run engine to the real database, adapters, connections and audit log. Used by the route handlers. */
const numberFromEnv = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function getRunEngine() {
  const { key, version } = getTokenKey();
  const connections = createDrizzleConnectionsStore(db);
  const audit = auditStore();

  const refreshGoogle = async (refreshToken: string) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new TokenRefreshError("temporary");
    return createGoogleClient({ clientId, clientSecret, redirectUri: "" }).refresh(refreshToken);
  };

  return createRunEngine({
    store: createDrizzleRunStore(db),
    getAdapter,
    getAccessToken: (connectionId, userId) =>
      getAccessToken(
        { store: connections, refresh: refreshGoogle, key, keyVersion: version, now: () => new Date(), skewMs: 60_000 },
        connectionId,
        userId,
      ),
    checkRateLimit: enforceRateLimit,
    recordEvent: (e) => recordEvent(audit, e),
    now: () => new Date(),
    appCallTimeoutMs: numberFromEnv("APP_CALL_TIMEOUT_MS", 15_000),
    staleRunningMs: numberFromEnv("STALE_RUNNING_MS", 90_000),
  });
}
