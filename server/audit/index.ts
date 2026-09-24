import "server-only";
import { db } from "@/db/client";
import { checkRateLimit, type RateBucket } from "./events";
import { createDrizzleAuditStore } from "./drizzle-store";

/** Wires audit logic to the real database. Used by route handlers and the run engine. */
export const auditStore = () => createDrizzleAuditStore(db);

export const enforceRateLimit = (userId: string, bucket: RateBucket) =>
  checkRateLimit({ store: auditStore(), now: () => new Date() }, userId, bucket);
