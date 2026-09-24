import { existsSync } from "node:fs";

/**
 * Shared, script-safe way to find the database URL (no "server-only", so drizzle-kit and
 * scripts can import it). Never print the URL: it contains the database password.
 */
export function loadEnvLocal(): void {
  if (!process.env.DATABASE_URL && existsSync(".env.local")) process.loadEnvFile(".env.local");
}

export function getDatabaseUrl(opts: { required?: boolean } = {}): string {
  const { required = true } = opts;
  loadEnvLocal();
  const url = process.env.DATABASE_URL ?? "";
  if (required && !url) {
    throw new Error("DATABASE_URL is not set. Add it to .env.local (or pass it inline for one command).");
  }
  if (url.includes("[YOUR-PASSWORD]")) {
    throw new Error("DATABASE_URL still contains the [YOUR-PASSWORD] placeholder. Put the real password in.");
  }
  return url;
}
