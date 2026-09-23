import "server-only";
import { parseKey } from "./crypto";

/** The only place the token-encryption key is read from the environment. */
export function getTokenKey(): { key: Buffer; version: number } {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY is not set.");
  return { key: parseKey(raw), version: Number(process.env.TOKEN_KEY_VERSION ?? "1") };
}

// TODO(T9): Google + Slack OAuth start/callback, save/load encrypted tokens in
// private.connection_secrets, quiet renewal, mark connection "needs_reconnect" when renewal fails.
