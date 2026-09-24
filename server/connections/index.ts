import "server-only";
import { db } from "@/db/client";
import { AppError } from "@/lib/errors";
import { PROVIDERS, type Provider } from "@/lib/types";
import { createDrizzleConnectionsStore } from "./drizzle-store";
import { googleProvider, slackProvider } from "./providers";
import { getTokenKey } from "./secrets";
import { createConnectionsService } from "./service";

/** Wires the connections service to the real database, keys and providers. Used by the route handlers. */
export function parseProvider(value: string | undefined): Provider {
  const provider = PROVIDERS.find((p) => p === value);
  if (!provider) throw new AppError("not_found", "Unknown app.");
  return provider;
}

export function getConnectionsService(origin: string) {
  const { key, version } = getTokenKey();
  return createConnectionsService({
    store: createDrizzleConnectionsStore(db),
    providerFor: (provider, requestOrigin) => {
      const redirectUri = `${requestOrigin}/api/connections/${provider}/callback`;
      const clientId = process.env[provider === "google" ? "GOOGLE_CLIENT_ID" : "SLACK_CLIENT_ID"];
      const clientSecret = process.env[provider === "google" ? "GOOGLE_CLIENT_SECRET" : "SLACK_CLIENT_SECRET"];
      if (!clientId || !clientSecret) throw new AppError("internal", "This app is not set up on the server yet.");
      const cfg = { clientId, clientSecret, redirectUri };
      return provider === "google" ? googleProvider(cfg) : slackProvider(cfg);
    },
    tokenKey: key,
    keyVersion: version,
    now: () => new Date(),
    transactionTtlMs: 10 * 60_000,
    secureCookies: origin.startsWith("https://"),
  });
}
