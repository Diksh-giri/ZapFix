import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/** Server-side database access using the service connection (bypasses RLS). Handlers must check ownership. */
const url = process.env.DATABASE_URL;

export const db = drizzle(postgres(url ?? "postgres://invalid", { prepare: false }), { schema });
