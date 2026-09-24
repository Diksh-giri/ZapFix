import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { events, rateLimits, runs } from "@/db/schema";
import type * as schema from "@/db/schema";
import type { AuditStore } from "./store";

/** The real database behind AuditStore. The database is passed in; this file never reads connection strings. */
export function createDrizzleAuditStore(db: PostgresJsDatabase<typeof schema>): AuditStore {
  return {
    async insertEvent(e) {
      await db.insert(events).values({ userId: e.userId, runId: e.runId, type: e.type, payload: e.payload });
    },

    async hasEvent(userId, runId, type) {
      const rows = await db
        .select({ id: events.id })
        .from(events)
        .where(and(eq(events.userId, userId), eq(events.runId, runId), eq(events.type, type)))
        .limit(1);
      return rows.length > 0;
    },

    async incrementRateLimit(userId, bucket, windowStart) {
      const [row] = await db
        .insert(rateLimits)
        .values({ userId, bucket, windowStart, count: 1 })
        .onConflictDoUpdate({
          target: [rateLimits.userId, rateLimits.bucket, rateLimits.windowStart],
          set: { count: sql`${rateLimits.count} + 1` },
        })
        .returning({ count: rateLimits.count });
      if (!row) throw new Error("The rate limit counter could not be updated.");
      return row.count;
    },

    async runOwnedBy(runId, userId) {
      const rows = await db
        .select({ id: runs.id })
        .from(runs)
        .where(and(eq(runs.id, runId), eq(runs.userId, userId)))
        .limit(1);
      return rows.length > 0;
    },
  };
}
