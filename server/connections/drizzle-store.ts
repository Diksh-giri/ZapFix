import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { connections, connectionSecrets } from "@/db/schema";
import type * as schema from "@/db/schema";
import type { Provider } from "@/lib/types";
import type { ConnectionsStore } from "./service";

/**
 * The real database behind ConnectionsStore. The database is passed in, so this file never reads
 * connection strings. It runs on the service connection, which bypasses row-level security, so every
 * query that takes a user id filters by it: ownership is checked here, not by the database.
 */
export function createDrizzleConnectionsStore(db: PostgresJsDatabase<typeof schema>): ConnectionsStore {
  return {
    async getConnection(id) {
      const [row] = await db
        .select({ id: connections.id, userId: connections.userId, provider: connections.provider, status: connections.status })
        .from(connections)
        .where(eq(connections.id, id))
        .limit(1);
      return row;
    },

    async loadSecret(connectionId) {
      const [row] = await db
        .select({ ciphertext: connectionSecrets.ciphertext })
        .from(connectionSecrets)
        .where(eq(connectionSecrets.connectionId, connectionId))
        .limit(1);
      return row?.ciphertext;
    },

    async saveSecret(connectionId, ciphertext, keyVersion) {
      await db
        .insert(connectionSecrets)
        .values({ connectionId, ciphertext, keyVersion })
        .onConflictDoUpdate({
          target: connectionSecrets.connectionId,
          set: { ciphertext, keyVersion, updatedAt: new Date() },
        });
    },

    async markNeedsReconnect(connectionId, errorCode) {
      await db
        .update(connections)
        .set({ status: "needs_reconnect", lastErrorCode: errorCode, updatedAt: new Date() })
        .where(eq(connections.id, connectionId));
    },

    async upsertConnection({ userId, provider, scopes, accountLabel, now }) {
      const fresh = { status: "active", scopes, accountLabel, connectedAt: now, lastErrorCode: null, updatedAt: now };
      const [row] = await db
        .insert(connections)
        .values({ userId, provider, ...fresh })
        .onConflictDoUpdate({ target: [connections.userId, connections.provider], set: fresh })
        .returning({ id: connections.id });
      if (!row) throw new Error("The connection could not be saved.");
      return row;
    },

    async listConnections(userId) {
      const rows = await db
        .select({
          id: connections.id,
          userId: connections.userId,
          provider: connections.provider,
          status: connections.status,
          scopes: connections.scopes,
          accountLabel: connections.accountLabel,
          connectedAt: connections.connectedAt,
          lastErrorCode: connections.lastErrorCode,
        })
        .from(connections)
        .where(eq(connections.userId, userId))
        .orderBy(connections.connectedAt);
      return rows.map((r) => ({ ...r, provider: r.provider as Provider }));
    },

    async deleteConnection(id, userId) {
      const deleted = await db
        .delete(connections)
        .where(and(eq(connections.id, id), eq(connections.userId, userId)))
        .returning({ id: connections.id }); // the secret goes with it (ON DELETE CASCADE)
      return deleted.length > 0;
    },
  };
}
