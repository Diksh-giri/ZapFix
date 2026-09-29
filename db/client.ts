import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/** Server-side database access using the service connection (bypasses RLS). Handlers must check ownership. */
const url = process.env.DATABASE_URL;

// In dev, Next.js reloads this module on nearly every file edit. Without caching the client on
// globalThis, each reload opens a fresh connection pool (default 10 connections) without closing
// the old one, quietly exhausting Supabase's connection limit until every DB-backed route 500s.
const globalForDb = globalThis as unknown as { __db?: ReturnType<typeof drizzle<typeof schema>> };

export const db =
  globalForDb.__db ?? drizzle(postgres(url ?? "postgres://invalid", { prepare: false }), { schema });

if (process.env.NODE_ENV !== "production") globalForDb.__db = db;
