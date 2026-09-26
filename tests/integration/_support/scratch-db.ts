import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

/**
 * Shared setup for the integration tests that need a REAL Postgres.
 *
 * SCRATCH DATABASE ONLY. These tests empty auth.users (and everything hanging off it), like tests/db/safety.sql.
 * They are skipped unless BOTH are set:  DB_URL=<scratch database>  CONFIRM_SCRATCH=yes
 * and they refuse to run against the app's own database (DATABASE_URL, zapfix-dev). The database must already
 * have the migrations applied. They share one database, so run them one file at a time:
 *   DB_URL=... CONFIRM_SCRATCH=yes npx vitest run tests/integration --no-file-parallelism
 */
const url = process.env.DB_URL;

export const scratchEnabled = Boolean(url) && process.env.CONFIRM_SCRATCH === "yes" && url !== process.env.DATABASE_URL;

export const sql = scratchEnabled ? postgres(url!, { prepare: false, max: 5 }) : undefined;
export const db = sql ? drizzle(sql, { schema }) : undefined;

export const USER = "00000000-0000-4000-8000-0000000000a1";
export const OTHER_USER = "00000000-0000-4000-8000-0000000000a2";

/** Empties auth.users (cascading) and adds the two test users. */
export async function resetUsers(): Promise<void> {
  await sql!`truncate auth.users cascade`;
  await sql!`insert into auth.users(id) values (${USER}), (${OTHER_USER})`;
}
