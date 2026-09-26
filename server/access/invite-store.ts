import { and, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { invites } from "@/db/schema";
import type * as schema from "@/db/schema";
import type { InviteStatus, InviteStore } from "./invite";

export function createDrizzleInviteStore(db: PostgresJsDatabase<typeof schema>): InviteStore {
  return {
    async getStatus(email) {
      const [row] = await db.select({ status: invites.status }).from(invites).where(eq(invites.email, email)).limit(1);
      return (row?.status as InviteStatus | undefined) ?? null;
    },

    async activate(email) {
      const rows = await db
        .update(invites)
        .set({ status: "active" })
        .where(and(eq(invites.email, email), inArray(invites.status, ["invited", "active"])))
        .returning({ email: invites.email });
      return rows.some((row) => row.email === email);
    },
  };
}
